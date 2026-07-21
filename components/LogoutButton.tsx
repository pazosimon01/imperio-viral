"use client";

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login";
      }}
      className="text-xs text-neutral-500 hover:text-neutral-200"
      title="Cerrar sesión"
    >
      Salir
    </button>
  );
}
