"use client";

import { useState } from "react";
import Link from "next/link";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "signup" ? { email, password, name, invite } : { email, password }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error");
        setBusy(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Error de red. Intenta de nuevo.");
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-md border border-neutral-700 bg-neutral-900 p-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:border-blue-500 focus:outline-none";

  return (
    <div className="mx-auto mt-10 w-full max-w-sm">
      <div className="mb-6 text-center">
        <div className="text-3xl">👑</div>
        <h1 className="mt-1 text-2xl font-bold">IMPERIO</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {mode === "login"
            ? "Entra a tu centro de marketing"
            : "Crea tu cuenta para empezar"}
        </p>
      </div>

      <form
        onSubmit={submit}
        className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-5"
      >
        {mode === "signup" && (
          <input
            className={input}
            placeholder="Tu nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        )}
        <input
          className={input}
          type="email"
          placeholder="Correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <input
          className={input}
          type="password"
          placeholder="Contraseña (mínimo 8)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
        />
        {mode === "signup" && (
          <input
            className={input}
            placeholder="Código de invitación"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            required
          />
        )}

        {error && <p className="text-sm text-red-400">⚠️ {error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:bg-neutral-700"
        >
          {busy ? "Un momento…" : mode === "login" ? "Entrar" : "Crear cuenta"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-neutral-500">
        {mode === "login" ? (
          <>
            ¿No tienes cuenta?{" "}
            <Link href="/signup" className="text-blue-400 hover:underline">
              Regístrate
            </Link>
          </>
        ) : (
          <>
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="text-blue-400 hover:underline">
              Entra
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
