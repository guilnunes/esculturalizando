const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dataCurta = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
});

const diaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });

export function formatBRL(value: number): string {
  return brl.format(value);
}

export function formatDataCurta(iso: string): string {
  return dataCurta.format(new Date(`${iso}T12:00:00`));
}

export function formatDiaSemana(iso: string): string {
  return diaSemana.format(new Date(`${iso}T12:00:00`));
}
