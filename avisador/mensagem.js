// Monta o texto do aviso que chega no WhatsApp do barbeiro.
// (*texto* = negrito no WhatsApp)

function dataPorExtenso(dataISO) {
  const [a, m, d] = dataISO.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  const semana = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long" }).format(dt);
  return `${semana}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function formatarTelefone(digitos) {
  const d = (digitos || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

export function montarMensagem(ag) {
  const linhas = [
    "💈 *Novo agendamento!*",
    "",
    `*Cliente:* ${ag.nome}`,
    `*Serviço:* ${ag.servico}`,
    `*Dia:* ${dataPorExtenso(ag.data)}`,
    `*Horário:* ${ag.horario}`,
  ];
  if (ag.telefone) linhas.push(`*WhatsApp:* ${formatarTelefone(ag.telefone)}`);
  return linhas.join("\n");
}
