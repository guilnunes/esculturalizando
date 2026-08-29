import type { Aluno, Aula, Mensalidade, Turma } from "./types";

export const turmas: Turma[] = [
  { id: "t-seg", nome: "Modelagem — segunda", horario: "19h00 às 21h00" },
  { id: "t-ter", nome: "Modelagem — terça", horario: "14h00 às 16h00" },
  { id: "t-qui", nome: "Torno — quinta", horario: "19h00 às 21h00" },
];

export const alunos: Aluno[] = [
  { id: "a-marina", nome: "Marina Bastos", turmaId: "t-ter" },
  { id: "a-rafael", nome: "Rafael Aguiar", turmaId: "t-ter" },
  { id: "a-heloisa", nome: "Heloísa Prado", turmaId: "t-seg" },
  { id: "a-tiago", nome: "Tiago Meireles", turmaId: "t-qui" },
  { id: "a-neusa", nome: "Neusa Camargo", turmaId: "t-seg" },
];

export const mensalidades: Mensalidade[] = [
  {
    id: "m-marina-08",
    alunoId: "a-marina",
    referencia: "Agosto",
    valor: 380,
    vencimento: "2026-08-10",
    status: "atrasado",
  },
  {
    id: "m-marina-09",
    alunoId: "a-marina",
    referencia: "Setembro",
    valor: 380,
    vencimento: "2026-09-10",
    status: "vence-em-breve",
  },
  {
    id: "m-tiago-08",
    alunoId: "a-tiago",
    referencia: "Agosto",
    valor: 420,
    vencimento: "2026-08-22",
    status: "atrasado",
  },
  {
    id: "m-heloisa-09",
    alunoId: "a-heloisa",
    referencia: "Setembro",
    valor: 380,
    vencimento: "2026-09-05",
    status: "vence-em-breve",
  },
  {
    id: "m-rafael-09",
    alunoId: "a-rafael",
    referencia: "Setembro",
    valor: 380,
    vencimento: "2026-09-10",
    status: "pago",
  },
  {
    id: "m-neusa-09",
    alunoId: "a-neusa",
    referencia: "Setembro",
    valor: 380,
    vencimento: "2026-09-10",
    status: "pago",
  },
];

export const proximasAulas: Aula[] = [
  {
    id: "au-ter-01",
    turmaId: "t-ter",
    data: "2026-09-01",
    regulares: { ocupadas: 8, total: 8 },
    reposicoes: { ocupadas: 1, total: 2 },
  },
  {
    id: "au-qui-03",
    turmaId: "t-qui",
    data: "2026-09-03",
    regulares: { ocupadas: 5, total: 8 },
    reposicoes: { ocupadas: 0, total: 2 },
  },
  {
    id: "au-seg-07",
    turmaId: "t-seg",
    data: "2026-09-07",
    regulares: { ocupadas: 7, total: 8 },
    reposicoes: { ocupadas: 2, total: 2 },
  },
];

export const alunoLogado = alunos[0] as Aluno;

export function turmaDe(turmaId: string): Turma {
  const turma = turmas.find((t) => t.id === turmaId);
  if (!turma) throw new Error(`Turma desconhecida: ${turmaId}`);
  return turma;
}

export function alunoDe(alunoId: string): Aluno {
  const aluno = alunos.find((a) => a.id === alunoId);
  if (!aluno) throw new Error(`Aluno desconhecido: ${alunoId}`);
  return aluno;
}
