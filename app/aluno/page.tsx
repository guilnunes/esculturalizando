import { CalendarPlus, CalendarX, Clock, Package } from "lucide-react";
import {
  AlertCard,
  AreaLink,
  Avatar,
  Button,
  Card,
  Money,
} from "@/components/ui";
import { alunoLogado, mensalidades, proximasAulas, turmaDe } from "@/lib/mock";
import { formatDataCurta, formatDiaSemana } from "@/lib/format";

const minhasMensalidades = mensalidades.filter(
  (m) => m.alunoId === alunoLogado.id,
);
const emAtraso = minhasMensalidades.find((m) => m.status === "atrasado");
const aPagar = minhasMensalidades.find((m) => m.status === "vence-em-breve");
const proximaAula = proximasAulas.find((a) => a.turmaId === alunoLogado.turmaId);

export default function AlunoPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <Avatar name={alunoLogado.nome} />
        <div>
          <p className="text-label text-text-muted">Bom te ver de novo</p>
          <h1 className="font-display text-title text-text">
            {alunoLogado.nome.split(" ")[0]}
          </h1>
        </div>
      </header>

      <div className="space-y-4">
        {emAtraso ? (
          <AlertCard label={`Mensalidade de ${emAtraso.referencia} em atraso`}>
            <Money
              value={emAtraso.valor}
              className="mt-2 block font-display text-display text-text"
            />
            <p className="mt-1 text-label text-text-muted">
              Venceu em {formatDataCurta(emAtraso.vencimento)}
            </p>
          </AlertCard>
        ) : null}

        {proximaAula ? (
          <Card>
            <p className="text-label text-text-muted">Próxima aula</p>
            <p className="mt-1 text-heading text-text">
              {formatDiaSemana(proximaAula.data)},{" "}
              {formatDataCurta(proximaAula.data)}
            </p>
            <p className="mt-1 text-label text-text-muted">
              {turmaDe(proximaAula.turmaId).nome} ·{" "}
              {turmaDe(proximaAula.turmaId).horario}
            </p>
            <Button
              variant="secondary"
              className="mt-4"
              full
              icon={<CalendarX size={20} strokeWidth={1.75} />}
            >
              Vou faltar
            </Button>
          </Card>
        ) : null}

        {aPagar ? (
          <Card>
            <p className="flex items-center gap-2 text-label text-text-muted">
              <Clock size={20} strokeWidth={1.75} className="text-warn" />
              Mensalidade de {aPagar.referencia}
            </p>
            <Money
              value={aPagar.valor}
              className="mt-2 block font-display text-title text-text"
            />
            <p className="mt-1 text-label text-text-muted">
              Vence em {formatDataCurta(aPagar.vencimento)}
            </p>
            <Button variant="primary" className="mt-4" full>
              Pagar
            </Button>
          </Card>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <AreaLink href="/aluno/produtos" icon={Package} label="Produtos" />
          <AreaLink
            href="/aluno/reposicao"
            icon={CalendarPlus}
            label="Reposição"
          />
        </div>
      </div>
    </main>
  );
}
