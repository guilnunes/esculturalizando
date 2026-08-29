export type StatusPagamento = "pago" | "vence-em-breve" | "atrasado";

export type Aluno = {
  id: string;
  nome: string;
  turmaId: string;
};

export type Mensalidade = {
  id: string;
  alunoId: string;
  referencia: string;
  valor: number;
  vencimento: string;
  status: StatusPagamento;
};

export type Ocupacao = {
  ocupadas: number;
  total: number;
};

export type Turma = {
  id: string;
  nome: string;
  horario: string;
};

export type Aula = {
  id: string;
  turmaId: string;
  data: string;
  regulares: Ocupacao;
  reposicoes: Ocupacao;
};
