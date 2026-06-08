"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, CAN_WRITE } from "@/lib/auth-helpers";

/**
 * Erzeugt oder liefert das bestehende Pack-Token eines Projekts.
 * Das Token wird im Public-Scan-URL verwendet (/scan/[token]) und nur
 * lazy beim ersten Bedarf angelegt.
 */
export async function getOrCreatePackToken(projectId: string): Promise<string> {
  await requireRole(CAN_WRITE);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { packToken: true },
  });
  if (!project) throw new Error("Projekt nicht gefunden");
  if (project.packToken) return project.packToken;

  const fresh = crypto.randomUUID().replace(/-/g, "");
  await prisma.project.update({
    where: { id: projectId },
    data: { packToken: fresh },
  });
  return fresh;
}

/**
 * Erzeugt ein neues Token (z.B. wenn das alte rumgereicht wurde).
 * Der alte Public-Link funktioniert danach nicht mehr.
 */
export async function regeneratePackToken(projectId: string): Promise<string> {
  await requireRole(CAN_WRITE);
  const fresh = crypto.randomUUID().replace(/-/g, "");
  await prisma.project.update({
    where: { id: projectId },
    data: { packToken: fresh },
  });
  revalidatePath(`/projects/${projectId}`);
  return fresh;
}

/**
 * Setzt alle PackingScans für das Projekt zurück — Start eines neuen Pack-Vorgangs.
 */
export async function resetPackingScansForProject(projectId: string): Promise<void> {
  await requireRole(CAN_WRITE);
  await prisma.packingScan.deleteMany({ where: { projectId } });
  revalidatePath(`/projects/${projectId}`);
}

/**
 * Löscht einen einzelnen Scan (z.B. wenn versehentlich falsch gescannt).
 */
export async function deletePackingScan(projectId: string, scanId: string): Promise<void> {
  await requireRole(CAN_WRITE);
  await prisma.packingScan.deleteMany({ where: { id: scanId, projectId } });
  revalidatePath(`/projects/${projectId}`);
}

/**
 * Resolved + speichert einen Scan vom Public-Endpoint aus.
 * KEIN requireRole — Auth erfolgt rein über den Token im Path-Param.
 *
 * Returns:
 *   { ok: true,  kind: "PACK_UNIT" | "DEVICE", name, code }
 *   { ok: false, reason: "INVALID_TOKEN" | "UNKNOWN_CODE" | "NOT_IN_PROJECT" }
 */
export type ScanResult =
  | {
      ok: true;
      kind: "PACK_UNIT" | "DEVICE";
      name: string;
      code: string;
      serial?: string;
    }
  | {
      ok: false;
      reason: "INVALID_TOKEN" | "UNKNOWN_CODE" | "NOT_IN_PROJECT";
    };

export async function submitScanWithToken(
  token: string,
  rawCode: string
): Promise<ScanResult> {
  const code = (rawCode ?? "").trim();
  if (!token || !code) {
    return { ok: false, reason: "INVALID_TOKEN" };
  }

  const project = await prisma.project.findFirst({
    where: { packToken: token },
    select: {
      id: true,
      assignments: { select: { deviceId: true } },
    },
  });
  if (!project) return { ok: false, reason: "INVALID_TOKEN" };

  const bookedDeviceIds = new Set(project.assignments.map((a) => a.deviceId));

  // QR-Codes der Stammdaten-Seiten enthalten eine URL:
  //   https://.../public/devices/<id>
  //   https://.../public/pack-units/<id>
  // Wir extrahieren die ID, damit der Scan auch funktioniert wenn ein
  // solcher QR-Code (statt eines reinen Barcodes) gescannt wird.
  let urlPackUnitId: string | null = null;
  let urlDeviceId: string | null = null;
  try {
    const url = new URL(code);
    const pathDevice = url.pathname.match(/\/public\/devices\/([^/?#]+)/);
    const pathPack = url.pathname.match(/\/public\/pack-units\/([^/?#]+)/);
    if (pathDevice) urlDeviceId = pathDevice[1];
    if (pathPack) urlPackUnitId = pathPack[1];
  } catch {
    // kein URL — egal, dann reine Code-Suche weiter unten
  }

  // 1) PackUnit über Code ODER URL-ID suchen
  const pu = await prisma.packUnit.findFirst({
    where: urlPackUnitId
      ? { id: urlPackUnitId }
      : { code },
    select: {
      id: true,
      code: true,
      name: true,
      items: { select: { deviceId: true } },
    },
  });
  if (pu) {
    // PackUnit ist relevant, wenn mindestens eines ihrer enthaltenen Geräte
    // im Projekt gebucht ist.
    const relevant = pu.items.some((i) => bookedDeviceIds.has(i.deviceId));
    if (!relevant) return { ok: false, reason: "NOT_IN_PROJECT" };

    await prisma.packingScan.create({
      data: {
        projectId: project.id,
        packUnitId: pu.id,
        scannedCode: code,
      },
    });
    revalidatePath(`/scan/${token}`);
    revalidatePath(`/projects/${project.id}`);
    return { ok: true, kind: "PACK_UNIT", name: pu.name, code: pu.code };
  }

  // 2a) Device direkt über URL-ID (QR-Code von /public/devices/<id>)
  if (urlDeviceId) {
    const device = await prisma.device.findUnique({
      where: { id: urlDeviceId },
      select: { id: true, name: true },
    });
    if (device) {
      if (!bookedDeviceIds.has(device.id)) {
        return { ok: false, reason: "NOT_IN_PROJECT" };
      }
      await prisma.packingScan.create({
        data: {
          projectId: project.id,
          deviceId: device.id,
          scannedCode: code,
        },
      });
      revalidatePath(`/scan/${token}`);
      revalidatePath(`/projects/${project.id}`);
      return { ok: true, kind: "DEVICE", name: device.name, code };
    }
  }

  // 2b) DeviceSerialNumber über barcode oder serialNumber
  const serial = await prisma.deviceSerialNumber.findFirst({
    where: { OR: [{ barcode: code }, { serialNumber: code }] },
    select: {
      id: true,
      serialNumber: true,
      device: { select: { id: true, name: true } },
    },
  });
  if (serial) {
    if (!bookedDeviceIds.has(serial.device.id)) {
      return { ok: false, reason: "NOT_IN_PROJECT" };
    }
    await prisma.packingScan.create({
      data: {
        projectId: project.id,
        deviceId: serial.device.id,
        deviceSerialId: serial.id,
        scannedCode: code,
      },
    });
    revalidatePath(`/scan/${token}`);
    revalidatePath(`/projects/${project.id}`);
    return {
      ok: true,
      kind: "DEVICE",
      name: serial.device.name,
      code,
      serial: serial.serialNumber,
    };
  }

  return { ok: false, reason: "UNKNOWN_CODE" };
}

/**
 * Setzt alle PackingScans vom Public-Endpoint aus zurück (Auth via Token).
 */
export async function resetPackingScansWithToken(
  token: string
): Promise<{ ok: boolean }> {
  const project = await prisma.project.findFirst({
    where: { packToken: token },
    select: { id: true },
  });
  if (!project) return { ok: false };
  await prisma.packingScan.deleteMany({ where: { projectId: project.id } });
  revalidatePath(`/scan/${token}`);
  revalidatePath(`/projects/${project.id}`);
  return { ok: true };
}

/**
 * Löscht einen Einzelscan vom Public-Endpoint (Auth via Token).
 */
export async function deletePackingScanWithToken(
  token: string,
  scanId: string
): Promise<{ ok: boolean }> {
  const project = await prisma.project.findFirst({
    where: { packToken: token },
    select: { id: true },
  });
  if (!project) return { ok: false };
  await prisma.packingScan.deleteMany({
    where: { id: scanId, projectId: project.id },
  });
  revalidatePath(`/scan/${token}`);
  revalidatePath(`/projects/${project.id}`);
  return { ok: true };
}
