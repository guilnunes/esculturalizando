import Link from "next/link";

const destinos = [
  { href: "/professor", rotulo: "Entrar como professor" },
  { href: "/aluno", rotulo: "Entrar como aluno" },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-6">
      <div>
        <h1 className="font-display text-display text-text">Esculturalizando</h1>
        <p className="mt-2 text-body text-text-muted">
          Fundação visual. Escolha uma das telas para visualizar.
        </p>
      </div>
      <nav className="space-y-3">
        {destinos.map((destino) => (
          <Link
            key={destino.href}
            href={destino.href}
            className="flex min-h-12 items-center rounded-control border border-clay px-5 text-body font-medium text-clay transition-colors hover:bg-clay-wash"
          >
            {destino.rotulo}
          </Link>
        ))}
      </nav>
    </main>
  );
}
