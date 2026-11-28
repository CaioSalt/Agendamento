// Página do cliente: escolher serviço, dia e horário e confirmar o agendamento.

const $ = (id) => document.getElementById(id);
const form = $("form");
const marcado = (nome) => form.querySelector(`input[name="${nome}"]:checked`)?.value || "";

let lojaDisponivel = true;      // o barbeiro pode "fechar a loja" pelo painel
let pararDeOuvirOcupados = null; // para cancelar o listener do dia anterior
let ocupadosDoDia = new Map(); // horário -> true se foi bloqueado pelo barbeiro
let diasBloqueados = new Set(); // folgas marcadas pelo barbeiro no painel
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
  CONFIG.servicos.forEach((s) => {
    const conteudo = [el("b", null, s.nome)];
    if (s.preco != null) conteudo.push(el("small", "preco", formatarPreco(s.preco)));
    box.append(criarChip("servico", s.nome, conteudo));
  });
}

function montarDias() {
  const { data: hoje, minutos } = agoraLocal();
  const ultimoHorario = paraMinutos(todosHorarios().at(-1));
  const box = $("dias");
  const selecionado = marcado("dia");
  box.innerHTML = "";

  let dia = hoje;
  let adicionados = 0;
  for (let i = 0; i < 60 && adicionados < CONFIG.diasParaAgendar; i++, dia = somarDias(dia, 1)) {
    if (CONFIG.diasFechados.includes(diaDaSemana(dia))) continue;
    if (dia === hoje && minutos >= ultimoHorario) continue; // hoje já acabou

    let rotulo = formatarData(dia, { weekday: "short" }).replace(".", "");
    if (dia === hoje) rotulo = "Hoje";
    else if (dia === somarDias(hoje, 1)) rotulo = "Amanhã";

    const folga = diasBloqueados.has(dia);
    const chegada = !folga && ehOrdemDeChegada(dia);
    const rodape = folga ? "folga" : chegada ? "chegada" : formatarData(dia, { month: "short" }).replace(".", "");
    const chip = criarChip("dia", dia, [
      el("small", null, rotulo),
      el("strong", null, formatarData(dia, { day: "2-digit" })),
      el("small", null, rodape),
    ], folga);
    if (folga) chip.title = "Sem atendimento neste dia";
    if (chegada) {
      chip.classList.add("chip-chegada");
      chip.title = "Atendimento por ordem de chegada";
    }
    if (dia === selecionado && !folga) chip.querySelector("input").checked = true;
    box.append(chip);
    adicionados++;
  }

  // Se o dia escolhido virou folga enquanto o cliente estava na página
  if (selecionado && !marcado("dia")) {
    if (pararDeOuvirOcupados) pararDeOuvirOcupados();
    diaCarregado = null;
    $("horarios").innerHTML = '<p class="vazio">Escolha um dia para ver os horários livres.</p>';
    atualizarResumo();
  }
}

// Escuta em tempo real os horários ocupados do dia escolhido.
// Se outra pessoa agendar enquanto o cliente está na página, o horário some na hora.
function carregarHorarios(dia) {
  if (pararDeOuvirOcupados) pararDeOuvirOcupados();
  pararDeOuvirOcupados = null;
  diaCarregado = dia;

  if (ehOrdemDeChegada(dia)) {
    mostrarOrdemDeChegada(dia);
    return;
  }

  $("horarios").innerHTML = '<p class="vazio">Carregando horários…</p>';

  pararDeOuvirOcupados = db.collection("ocupados")
    .where("data", "==", dia)
    .onSnapshot(
      (snap) => {
        ocupadosDoDia = new Map(snap.docs.map((d) => [d.data().horario, d.data().bloqueado === true]));
        montarHorarios();
      },
      (erro) => {
        console.error(erro);
        $("horarios").innerHTML = '<p class="vazio">Não foi possível carregar os horários. Verifique sua internet.</p>';
      }
    );
}

// Dia sem agendamento: mostra o aviso no lugar dos horários.
function mostrarOrdemDeChegada(dia) {
  const horas = CONFIG.periodos.map((p) => `das ${horaCurta(p.inicio)} às ${horaCurta(p.fim)}`).join(" ou ");
  const nome = formatarData(dia, { weekday: "long" });
  const box = $("horarios");
  box.innerHTML = "";
  const aviso = el("div", "aviso-chegada");
  aviso.append(
    el("strong", null, `${nome.charAt(0).toUpperCase()}${nome.slice(1)} é por ordem de chegada`),
    el("p", null, `Não precisa agendar: é só vir ${horas}. Atendemos na ordem em que os clientes chegarem. 💈`)
  );
  box.append(aviso);
  atualizarResumo();
}

function montarHorarios() {
  const dia = diaCarregado;
  if (!dia || ehOrdemDeChegada(dia)) return;
  const { data: hoje, minutos } = agoraLocal();
  const selecionado = marcado("horario");
  const box = $("horarios");
  box.innerHTML = "";
  let livres = 0;
  let bloqueados = 0;

  CONFIG.periodos.forEach((periodo) => {
    const grade = el("div", "grade");
    horariosDoPeriodo(periodo).forEach((h) => {
      const passou = dia === hoje && paraMinutos(h) <= minutos;
      const ocupado = ocupadosDoDia.has(h) || passou;
      if (!ocupado) livres++;
      if (ocupadosDoDia.get(h)) bloqueados++;
      const chip = criarChip("horario", h, h, ocupado);
      if (ocupado) chip.title = passou ? "Horário já passou" : "Horário indisponível";
      if (h === selecionado && !ocupado) chip.querySelector("input").checked = true;
      grade.append(chip);
    });
    box.append(el("p", "subgrupo", periodo.nome), grade);
  });

  if (livres === 0) {
    const semAtendimento = bloqueados === todosHorarios().length;
    box.prepend(el("p", "vazio", semAtendimento
      ? "Não haverá atendimento neste dia. Escolha outro dia."
      : "Este dia está lotado. Escolha outro dia."));
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
      diasBloqueados = new Set((doc.exists && doc.data().diasBloqueados) || []);
      atualizarStatus();
      montarDias();
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
  if (ehOrdemDeChegada(d.data)) return "Neste dia o atendimento é por ordem de chegada, sem agendamento.";
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

// ---------- Informações da barbearia ----------

const ICONES = {
  mapa: '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
  whatsapp: '<path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3 3Z"/><path d="M9 9.5c.3 1.6 1.9 3.9 4.4 5 .6.3 1.6-.2 1.9-.9l.2-.6-1.8-.9-.8.8c-.9-.3-2-1.3-2.4-2.3l.7-.8-.8-1.8-.6.1c-.6.2-1 .8-.8 1.4Z"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".6" fill="currentColor"/>',
};

function botaoLink(texto, href, icone) {
  const a = el("a", "botao botao-secundario botao-pequeno");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[icone]}</svg>`;
  a.append(texto);
  return a;
}

function montarInfo() {
  const info = CONFIG.barbearia;

  const lista = $("listaPrecos");
  CONFIG.servicos.forEach((s) => {
    const li = el("li");
    li.append(el("span", null, s.nome));
    if (s.preco != null) li.append(el("strong", null, formatarPreco(s.preco)));
    lista.append(li);
  });

  $("txtHorario").textContent = textoFuncionamento();

  if (info.endereco) {
    $("txtEndereco").textContent = info.endereco;
    $("blocoEndereco").hidden = false;
  }

  const acoes = $("infoAcoes");
  // "Como chegar": usa o link do Maps; se não tiver, pesquisa o endereço no Maps.
  const linkMapa = info.mapa
    || (info.endereco && `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.endereco)}`);
  if (linkMapa) acoes.append(botaoLink("Como chegar", linkMapa, "mapa"));
  if (info.whatsapp) {
    acoes.append(botaoLink("WhatsApp", `https://wa.me/55${apenasDigitos(info.whatsapp)}`, "whatsapp"));
  }
  if (info.instagram) {
    acoes.append(botaoLink("Instagram", `https://instagram.com/${info.instagram.replace("@", "")}`, "instagram"));
  }
  acoes.hidden = acoes.children.length === 0;
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
montarInfo();
atualizarStatus();
ouvirStatusDaLoja();

// A cada minuto: atualiza o status e esconde horários de hoje que já passaram.
setInterval(() => {
  atualizarStatus();
  montarHorarios();
}, 60 * 1000);
