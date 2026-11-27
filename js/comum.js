// ==========================================================
// Configurações da barbearia — altere aqui!
// ==========================================================
const CONFIG = {
  fusoHorario: "America/Sao_Paulo",

  // Dias da semana sem atendimento (0 = domingo, 1 = segunda, ... 6 = sábado)
  diasFechados: [0],

  // Períodos de atendimento. "fim" é o horário em que fecha (não é agendável).
  periodos: [
    { nome: "Manhã", inicio: "08:00", fim: "11:00" },
    { nome: "Tarde", inicio: "13:00", fim: "18:00" },
  ],

  // Duração de cada horário, em minutos
  intervalo: 30,

  // Quantos dias à frente o cliente pode escolher
  diasParaAgendar: 14,

  servicos: ["Corte Masculino", "Corte Feminino", "Barba"],
};

// ==========================================================
// Funções de apoio usadas pelas páginas
// ==========================================================

// "08:30" -> 510
function paraMinutos(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// 510 -> "08:30"
function paraHHMM(minutos) {
  const h = String(Math.floor(minutos / 60)).padStart(2, "0");
  const m = String(minutos % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// Lista de horários de um período: ["08:00", "08:30", ...]
function horariosDoPeriodo(periodo) {
  const lista = [];
  for (let t = paraMinutos(periodo.inicio); t < paraMinutos(periodo.fim); t += CONFIG.intervalo) {
    lista.push(paraHHMM(t));
  }
  return lista;
}

function todosHorarios() {
  return CONFIG.periodos.flatMap(horariosDoPeriodo);
}

// Data e hora atuais no fuso da barbearia (não depende do relógio/fuso do celular do cliente
// estar configurado para o Brasil).
function agoraLocal() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: CONFIG.fusoHorario,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  return {
    data: `${p.year}-${p.month}-${p.day}`, // "2026-11-27"
    minutos: (Number(p.hour) % 24) * 60 + Number(p.minute),
  };
}

// Trabalhamos com datas como texto "AAAA-MM-DD" e fazemos as contas em UTC
// para não ter problema com fuso horário.
function dataUTC(dataISO) {
  const [a, m, d] = dataISO.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function somarDias(dataISO, n) {
  const dt = dataUTC(dataISO);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function diaDaSemana(dataISO) {
  return dataUTC(dataISO).getUTCDay();
}

function formatarData(dataISO, opcoes) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...opcoes }).format(dataUTC(dataISO));
}

// "sexta-feira, 28 de novembro"
function dataPorExtenso(dataISO) {
  return formatarData(dataISO, { weekday: "long", day: "numeric", month: "long" });
}

// Situação da loja agora (pelo horário de funcionamento)
function situacaoAgora() {
  const { data, minutos } = agoraLocal();
  if (CONFIG.diasFechados.includes(diaDaSemana(data))) return { aberto: false };
  for (const p of CONFIG.periodos) {
    if (minutos >= paraMinutos(p.inicio) && minutos < paraMinutos(p.fim)) {
      return { aberto: true, fechaAs: p.fim };
    }
  }
  return { aberto: false };
}

// Cria um elemento com classe e texto. Usar textContent evita que um nome
// digitado pelo cliente vire código HTML na página (ataque de XSS).
function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function apenasDigitos(texto) {
  return (texto || "").replace(/\D/g, "");
}

// "11912345678" -> "(11) 91234-5678"
function formatarTelefone(texto) {
  const d = apenasDigitos(texto).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ID do documento = data + horário. Assim o mesmo horário nunca é gravado duas vezes.
function idDoHorario(data, horario) {
  return `${data}_${horario}`;
}
