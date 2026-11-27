// Página do cliente: escolher serviço, dia e horário e confirmar o agendamento.

const $ = (id) => document.getElementById(id);
const form = $("form");
const marcado = (nome) => form.querySelector(`input[name="${nome}"]:checked`)?.value || "";

let lojaDisponivel = true;      // o barbeiro pode "fechar a loja" pelo painel
let pararDeOuvirOcupados = null; // para cancelar o listener do dia anterior
let ocupadosDoDia = new Set();
let diaCarregado = null;

// ---------- Montagem da tela ----------

function criarChip(nome, valor, conteudo, desabilitado = false) {
  const label = el("label", "chip");
  const input = el("input");
  input.type = "radio";
  input.name = nome;
  input.value = valor;
  input.disabled = desabilitado;
  const span = el("span");
  if (typeof conteudo === "string") span.textContent = conteudo;
  else span.append(...conteudo);
  label.append(input, span);
  return label;
}

function montarServicos() {
  const box = $("servicos");
  CONFIG.servicos.forEach((s) => box.append(criarChip("servico", s, s)));
}

function montarDias() {
  const { data: hoje, minutos } = agoraLocal();
  const ultimoHorario = paraMinutos(todosHorarios().at(-1));
  const box = $("dias");
  box.innerHTML = "";

  let dia = hoje;
  let adicionados = 0;
  for (let i = 0; i < 60 && adicionados < CONFIG.diasParaAgendar; i++, dia = somarDias(dia, 1)) {
    if (CONFIG.diasFechados.includes(diaDaSemana(dia))) continue;
    if (dia === hoje && minutos >= ultimoHorario) continue; // hoje já acabou

    let rotulo = formatarData(dia, { weekday: "short" }).replace(".", "");
    if (dia === hoje) rotulo = "Hoje";
    else if (dia === somarDias(hoje, 1)) rotulo = "Amanhã";

    box.append(criarChip("dia", dia, [
      el("small", null, rotulo),
      el("strong", null, formatarData(dia, { day: "2-digit" })),
      el("small", null, formatarData(dia, { month: "short" }).replace(".", "")),
    ]));
    adicionados++;
  }
}

// Escuta em tempo real os horários ocupados do dia escolhido.
// Se outra pessoa agendar enquanto o cliente está na página, o horário some na hora.
function carregarHorarios(dia) {
  if (pararDeOuvirOcupados) pararDeOuvirOcupados();
  diaCarregado = dia;
  $("horarios").innerHTML = '<p class="vazio">Carregando horários…</p>';

  pararDeOuvirOcupados = db.collection("ocupados")
    .where("data", "==", dia)
    .onSnapshot(
      (snap) => {
        ocupadosDoDia = new Set(snap.docs.map((d) => d.data().horario));
        montarHorarios();
      },
      (erro) => {
        console.error(erro);
        $("horarios").innerHTML = '<p class="vazio">Não foi possível carregar os horários. Verifique sua internet.</p>';
      }
    );
}

function montarHorarios() {
  const dia = diaCarregado;
  if (!dia) return;
  const { data: hoje, minutos } = agoraLocal();
  const selecionado = marcado("horario");
  const box = $("horarios");
  box.innerHTML = "";
  let livres = 0;

  CONFIG.periodos.forEach((periodo) => {
    const grade = el("div", "grade");
    horariosDoPeriodo(periodo).forEach((h) => {
      const passou = dia === hoje && paraMinutos(h) <= minutos;
      const ocupado = ocupadosDoDia.has(h) || passou;
      if (!ocupado) livres++;
      const chip = criarChip("horario", h, h, ocupado);
      if (ocupado) chip.title = passou ? "Horário já passou" : "Horário ocupado";
      if (h === selecionado && !ocupado) chip.querySelector("input").checked = true;
      grade.append(chip);
    });
    box.append(el("p", "subgrupo", periodo.nome), grade);
  });

  if (livres === 0) {
    box.prepend(el("p", "vazio", "Este dia está lotado. Escolha outro dia."));
  }
  atualizarResumo();
}

// ---------- Status (aberto/fechado) ----------

function atualizarStatus() {
  const status = $("status");
  if (!lojaDisponivel) {
    status.className = "selo fechado";
    status.textContent = "Agendamentos pausados no momento";
    return;
  }
  const s = situacaoAgora();
  if (s.aberto) {
    status.className = "selo aberto";
    status.textContent = `Aberto agora · até ${s.fechaAs}`;
  } else {
    status.className = "selo";
    status.textContent = "Fechado agora · agende seu próximo horário";
  }
}

function ouvirStatusDaLoja() {
  db.collection("config").doc("loja").onSnapshot(
    (doc) => {
      // Se o documento não existir, consideramos a loja disponível.
      lojaDisponivel = !(doc.exists && doc.data().disponivel === false);
      atualizarStatus();
      atualizarResumo();
    },
    (erro) => {
      console.error(erro);
      atualizarStatus();
    }
  );
}

// ---------- Formulário ----------

function lerFormulario() {
  return {
    servico: marcado("servico"),
    data: marcado("dia"),
    horario: marcado("horario"),
    nome: $("nome").value.trim(),
    telefone: apenasDigitos($("telefone").value),
  };
}

function problemaNoFormulario(d) {
  if (!lojaDisponivel) return "Os agendamentos estão pausados no momento.";
  if (!d.servico) return "Escolha um serviço.";
  if (!d.data) return "Escolha um dia.";
  if (!d.horario) return "Escolha um horário.";
  if (d.nome.length < 2) return "Digite seu nome.";
  if (d.telefone && (d.telefone.length < 10 || d.telefone.length > 11)) return "WhatsApp inválido. Use DDD + número.";
  return null;
}

function atualizarResumo() {
  const d = lerFormulario();
  const resumo = $("resumo");
  if (d.servico && d.data && d.horario) {
    resumo.textContent = `${d.servico} · ${dataPorExtenso(d.data)} às ${d.horario}`;
    resumo.hidden = false;
  } else {
    resumo.hidden = true;
  }
  $("btnConfirmar").disabled = problemaNoFormulario(d) !== null;
}

function mostrarErro(msg) {
  const e = $("erro");
  e.textContent = msg || "";
  e.hidden = !msg;
}

async function confirmar(evento) {
  evento.preventDefault();
  const d = lerFormulario();
  const problema = problemaNoFormulario(d);
  if (problema) return mostrarErro(problema);
  mostrarErro(null);

  const botao = $("btnConfirmar");
  botao.disabled = true;
  botao.textContent = "Confirmando…";

  const id = idDoHorario(d.data, d.horario);
  const refOcupado = db.collection("ocupados").doc(id);
  const refAgendamento = db.collection("agendamentos").doc(id);

  try {
    // Transação: lê e grava de uma vez só. Se duas pessoas tentarem o mesmo
    // horário ao mesmo tempo, só a primeira consegue.
    await db.runTransaction(async (t) => {
      const ocupado = await t.get(refOcupado);
      if (ocupado.exists) throw new Error("HORARIO_OCUPADO");
      t.set(refOcupado, { data: d.data, horario: d.horario });
      t.set(refAgendamento, {
        ...d,
        criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
    mostrarSucesso(d);
  } catch (erro) {
    console.error(erro);
    if (erro.message === "HORARIO_OCUPADO") {
      mostrarErro("Poxa, esse horário acabou de ser reservado por outra pessoa. Escolha outro.");
    } else {
      mostrarErro("Não foi possível confirmar agora. Verifique sua internet e tente de novo.");
    }
  } finally {
    botao.textContent = "Confirmar agendamento";
    atualizarResumo();
  }
}

function mostrarSucesso(d) {
  const lista = $("detalhes");
  lista.innerHTML = "";
  [
    ["Nome", d.nome],
    ["Serviço", d.servico],
    ["Dia", dataPorExtenso(d.data)],
    ["Horário", d.horario],
  ].forEach(([rotulo, valor]) => {
    const li = el("li");
    li.append(el("span", null, rotulo), el("strong", null, valor));
    lista.append(li);
  });
  $("secaoForm").hidden = true;
  $("secaoSucesso").hidden = false;
  $("secaoSucesso").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function novoAgendamento() {
  const nome = $("nome").value;
  const telefone = $("telefone").value;
  form.reset();
  $("nome").value = nome;           // mantém os dados da pessoa
  $("telefone").value = telefone;
  if (pararDeOuvirOcupados) pararDeOuvirOcupados();
  diaCarregado = null;
  $("horarios").innerHTML = '<p class="vazio">Escolha um dia para ver os horários livres.</p>';
  $("secaoSucesso").hidden = true;
  $("secaoForm").hidden = false;
  montarDias();
  atualizarResumo();
}

// ---------- Início ----------

form.addEventListener("change", (e) => {
  if (e.target.name === "dia") carregarHorarios(e.target.value);
  mostrarErro(null);
  atualizarResumo();
});
form.addEventListener("input", atualizarResumo);
form.addEventListener("submit", confirmar);
$("telefone").addEventListener("input", (e) => {
  e.target.value = formatarTelefone(e.target.value);
});
$("btnNovo").addEventListener("click", novoAgendamento);

montarServicos();
montarDias();
atualizarStatus();
ouvirStatusDaLoja();

// A cada minuto: atualiza o status e esconde horários de hoje que já passaram.
setInterval(() => {
  atualizarStatus();
  montarHorarios();
}, 60 * 1000);
