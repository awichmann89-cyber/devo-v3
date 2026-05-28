import type { NextAuthConfig } from "next-auth";

// Edge-safe Konfiguration — keine Prisma/Node.js-Imports!
// Wird sowohl von der Middleware (Edge Runtime) als auch von der vollen
// auth.ts (Node.js Runtime) verwendet.
//
// Die Providers (Credentials) werden erst in auth.ts ergänzt, weil
// authorize() Prisma + bcrypt braucht — beides nicht Edge-kompatibel.

// Lokal deklariert, um Prisma-Imports in der Edge-Bundle zu vermeiden.
type Role = "ADMIN" | "DISPONENT" | "READER";

const authConfig = {
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [], // wird in auth.ts mit Credentials gefüllt
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: Role }).role;
        token.id = user.id as string;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
