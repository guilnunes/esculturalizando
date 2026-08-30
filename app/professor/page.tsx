import {
  AlertCircle,
  CalendarDays,
  Check,
  CirclePlus,
  Clock,
  Package,
  Users,
  Wallet,
} from "lucide-react";
import { AreaLink, Avatar, Card, Money } from "@/components/ui";
import { alunoDe, mensalidades, proximasAulas, turmaDe } from "@/lib/mock";
import { formatDataCurta, formatDiaSemana } from "@/lib/format";
import type { Aula, Mensalidade } from "@/lib/types";

const pendencias = mensalidades
  .filter((m) => m.status !== "pago")
  .sort((a, b) => {
    const peso = (m: Mensalidade) => (m.status === "atrasado" ? 0 : 1);
    return peso(a) - peso(b) || a.vencimento.localeCompare(b.vencimento);
  });

const emDia = mensalidades.filter((m) => m.status === "pago").length;

function LinhaPendencia({ mensalidade }: { mensalidade: Mensalidade }) {
  const aluno = alunoDe(mensalidade.alunoId);
  const atrasada = mensalidade.status === "atrasado";
  const Icone = atrasada ? AlertCircle : Clock;

  return (
    <li className="flex min-h-12 items-center gap-3 border-b border-border py-3 last:border-b-0 last:pb-0">
      <Avatar name={aluno.nome} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body text-text">{aluno.nome}</p>
        <p className="flex items-center gap-1.5 text-micro text-text-muted">
          <Icone
            size={16}
            strokeWidth={1.75}
            className={atrasada ? "text-clay" : "text-warn"}
          />
          {atrasada ? "Venceu" : "Vence"} em{" "}
          {formatDataCurta(mensalidade.vencimento)}
        </p>
      </div>
      <Money
        value={mensalidade.valor}
        className={atrasada ? "text-heading text-text" : "text-body text-text-muted"}
      />
    </li>
  );
}

function Ocupacao({ rotulo, ocupadas, total }: { rotulo: string; ocupadas: number; total: number }) {
  return (
    <div className="rounded-control border border-border p-3">
      <p className="text-micro text-text-muted">{rotulo}</p>
      <p className="mt-1 text-heading tabular-nums text-text">
        {ocupadas} de {total}
      </p>
    </div>
  );
}

function CardAula({ aula }: { aula: Aula }) {
  const turma = turmaDe(aula.turmaId);
  const reposicoesLivres = aula.reposicoes.total - aula.reposicoes.ocupadas;

  return (
    <Card>
      <p className="text-body text-text">{turma.nome}</p>
      <p className="mt-1 text-label text-text-muted">
        {formatDiaSemana(aula.data)}, {formatDataCurta(aula.data)} ·{" "}
        {turma.horario}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Ocupacao
          rotulo="Vagas regulares"
          ocupadas={aula.regulares.ocupadas}
          total={aula.regulares.total}
        />
        <Ocupacao
          rotulo="Vagas de reposição"
          ocupadas={aula.reposicoes.ocupadas}
          total={aula.reposicoes.total}
        />
      </div>
      {reposicoesLivres > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-micro text-text-muted">
          <CirclePlus size={16} strokeWidth={1.75} className="text-clay" />
          {reposicoesLivres === 1
            ? "1 vaga de reposição livre"
            : `${reposicoesLivres} vagas de reposição livres`}
        </p>
      ) : null}
    </Card>
  );
}

export default function ProfessorPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <h1 className="mb-6 font-display text-title text-text">Ateliê</h1>

      <section className="mb-6">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-label font-medium text-text">Pendências</h2>
          <p className="flex items-center gap-1.5 text-micro text-text-muted">
            <Check size={16} strokeWidth={1.75} className="text-ok" />
            {emDia} mensalidades em dia
          </p>
        </div>
        <Card>
          <ul>
            {pendencias.map((m) => (
              <LinhaPendencia key={m.id} mensalidade={m} />
            ))}
          </ul>
        </Card>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-label font-medium text-text">Próximas aulas</h2>
        <div className="space-y-3">
          {proximasAulas.map((aula) => (
            <CardAula key={aula.id} aula={aula} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-label font-medium text-text">Áreas</h2>
        <div className="grid grid-cols-2 gap-3">
          <AreaLink
            href="/professor/produtos"
            icon={Package}
            label="Produtos"
          />
          <AreaLink href="/professor/alunos" icon={Users} label="Alunos" />
          <AreaLink
            href="/professor/calendario"
            icon={CalendarDays}
            label="Calendário"
          />
          <AreaLink
            href="/professor/financeiro"
            icon={Wallet}
            label="Financeiro"
          />
        </div>
      </section>
    </main>
  );
}
