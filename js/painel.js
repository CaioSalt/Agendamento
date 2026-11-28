// Painel do barbeiro: ver/cancelar agendamentos e abrir/fechar a loja.

const $ = (id) => document.getElementById(id);

let lojaDisponivel = true;
let diasBloqueados = [];       // folgas de dia inteiro (ficam em config/loja)
let pararDeOuvirDia = null;    // listener dos horários do dia escolhido em "Folgas"
let ocupadosDoDia = new Map(); // horário -> { bloqueado }
let abaAtual = "proximos";
let pararDeOuvirLista = null;

const ICONE_LIXEIRA =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';

// ---------- Acesso: só entra quem está logado ----------

auth.onAuthStateChanged((usuario) => {
  if (!usuario) {
    location.replace("login.html");
    return;
  }
  $("usuario").textContent = usuario.email;
  $("carregando").hidden = true;
  $("conteudo").hidden = false;
  iniciar();
});

$("btnSair").addEventListener("click", () => auth.signOut());

function mostrarErro(erro) {
  const box = $("erro");
  if (!erro) {
    box.hidden = true;
    return;
  }
  console.error(erro);
  box.textContent = erro.code === "permission-denied"
    ? "Sua conta não tem permissão para ver os agendamentos. O UID desta conta precisa estar no firestore.rules (veja o README)."
    : "Erro ao carregar os dados. Verifique sua internet.";
  box.hidden = false;
}

// ---------- Abrir / fechar a loja ----------

function ouvirStatusDaLoja() {
  db.collection("config").doc("loja").onSnapshot((doc) => {
    // Documento inexistente = loja aberta (mesma regra da página do cliente).
    lojaDisponivel = !(doc.exists && doc.data().disponivel === false);
    diasBloqueados = (doc.exists && doc.data().diasBloqueados) || [];
    montarGradeBloqueio();
    montarListaBloqueios();
    const selo = $("statusLoja");
    const botao = $("btnLoja");
    if (lojaDisponivel) {
      selo.className = "selo aberto";
      selo.textContent = "Agendamentos abertos";
      botao.textContent = "Fechar loja";
    } else {
      selo.className = "selo fechado";
      selo.textContent = "Agendamentos pausados";
      botao.textContent = "Abrir loja";
    }
    botao.disabled = false;
  }, mostrarErro);
}

$("btnLoja").addEventListener("click", async () => {
  const botao = $("btnLoja");
  botao.disabled = true;
  try {
    await db.collection("config").doc("loja").set({ disponivel: !lojaDisponivel }, { merge: true });
  } catch (erro) {
    mostrarErro(erro);
    botao.disabled = false;
  }
});

// ---------- Lista de agendamentos ----------

function ouvirLista() {
  if (pararDeOuvirLista) pararDeOuvirLista();
  $("lista").innerHTML = '<p class="vazio">Carregando…</p>';
  const hoje = agoraLocal().data;

  let consulta = db.collection("agendamentos");
  consulta = abaAtual === "proximos"
    ? consulta.where("data", ">=", hoje).orderBy("data")
    : consulta.where("data", "<", hoje).orderBy("data", "desc").limit(200);

  pararDeOuvirLista = consulta.onSnapshot((snap) => {
    mostrarErro(null);
    const itens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (abaAtual === "proximos") atualizarContadores(itens, hoje);
    montarLista(itens, hoje);
  }, mostrarErro);
}

function atualizarContadores(itens, hoje) {
  $("qtdHoje").textContent = itens.filter((a) => a.data === hoje).length;
  $("qtdProximos").textContent = itens.length;
}

function montarLista(itens, hoje) {
  const box = $("lista");
  box.innerHTML = "";

  if (itens.length === 0) {
    box.append(el("p", "vazio", abaAtual === "proximos"
      ? "Nenhum agendamento por enquanto."
      : "Nenhum agendamento anterior."));
    return;
  }

  // Agrupa por data
  const porData = {};
  itens.forEach((a) => (porData[a.data] ||= []).push(a));

  const crescente = abaAtual === "proximos";
  const datas = Object.keys(porData).sort();
  if (!crescente) datas.reverse();

  const agora = agoraLocal();

  datas.forEach((data) => {
    const lista = porData[data].sort((a, b) => a.horario.localeCompare(b.horario));

    let titulo = dataPorExtenso(data);
    if (data === hoje) titulo = `Hoje · ${titulo}`;
    else if (data === somarDias(hoje, 1)) titulo = `Amanhã · ${titulo}`;

    const cabecalho = el("h2", "dia-titulo");
    cabecalho.append(
      el("span", null, titulo),
      el("span", "conta", `${lista.length} ${lista.length === 1 ? "cliente" : "clientes"}`)
    );
    box.append(cabecalho);

    lista.forEach((a) => box.append(cartaoAgendamento(a, agora)));
  });
}

function cartaoAgendamento(a, agora) {
  const passou = a.data < agora.data || (a.data === agora.data && paraMinutos(a.horario) + CONFIG.intervalo <= agora.minutos);

  const card = el("article", "agendamento" + (passou ? " passado" : ""));
  const info = el("div", "ag-info");
  info.append(el("strong", null, a.nome), el("span", "servico", a.servico));

  const tel = apenasDigitos(a.telefone);
  if (tel) {
    const link = el("a", "whats", `WhatsApp ${formatarTelefone(tel)}`);
    link.href = `https://wa.me/55${tel}`;
    link.target = "_blank";
    link.rel = "noopener";
    info.append(link);
  }

  const botao = el("button", "botao-icone");
  botao.type = "button";
  botao.innerHTML = ICONE_LIXEIRA; // ícone fixo, sem dados do cliente
  botao.title = "Cancelar agendamento";
  botao.setAttribute("aria-label", `Cancelar agendamento de ${a.nome} às ${a.horario}`);
  botao.addEventListener("click", () => cancelar(a));

  card.append(el("div", "ag-hora", a.horario), info, botao);
  return card;
}

async function cancelar(a) {
  const ok = confirm(`Cancelar o agendamento de ${a.nome} (${dataPorExtenso(a.data)} às ${a.horario})?`);
  if (!ok) return;
  try {
    // Apaga o agendamento e libera o horário para outros clientes.
    const lote = db.batch();
    lote.delete(db.collection("agendamentos").doc(a.id));
    lote.delete(db.collection("ocupados").doc(idDoHorario(a.data, a.horario)));
    await lote.commit();
  } catch (erro) {
    mostrarErro(erro);
  }
}

// ---------- Folgas e bloqueios ----------
// Bloquear um horário = criar o documento /ocupados/{data_horario} com bloqueado: true.
// Assim ele some para os clientes do mesmo jeito que um horário já agendado.
// Bloquear o dia inteiro = colocar a data na lista config/loja.diasBloqueados.

let bloqueiosDeHorario = []; // [{ data, horario }]

function escolherDiaBloqueio(dia) {
  if (pararDeOuvirDia) pararDeOuvirDia();
  ocupadosDoDia = new Map();
  if (!dia) return montarGradeBloqueio();
  $("gradeBloqueio").innerHTML = '<p class="vazio">Carregando…</p>';
  pararDeOuvirDia = db.collection("ocupados").where("data", "==", dia).onSnapshot((snap) => {
    ocupadosDoDia = new Map(snap.docs.map((d) => [d.data().horario, { bloqueado: d.data().bloqueado === true }]));
    montarGradeBloqueio();
  }, mostrarErro);
}

function montarGradeBloqueio() {
  const dia = $("diaBloqueio").value;
  const box = $("gradeBloqueio");
  const botaoDia = $("btnDiaInteiro");
  box.innerHTML = "";
  $("legenda").hidden = !dia;
  botaoDia.hidden = !dia;
  if (!dia) {
    box.append(el("p", "vazio", "Escolha um dia acima."));
    return;
  }

  const diaInteiro = diasBloqueados.includes(dia);
  const fechadoNaSemana = CONFIG.diasFechados.includes(diaDaSemana(dia));
  botaoDia.textContent = diaInteiro ? "Liberar o dia inteiro" : "Bloquear o dia inteiro";
  botaoDia.disabled = fechadoNaSemana;

  if (fechadoNaSemana) {
    box.append(el("p", "vazio", "A barbearia já não abre neste dia da semana."));
    return;
  }
  if (diaInteiro) {
    box.append(el("p", "vazio", `Dia inteiro bloqueado: ${dataPorExtenso(dia)}.`));
    return;
  }

  CONFIG.periodos.forEach((periodo) => {
    const grade = el("div", "grade");
    horariosDoPeriodo(periodo).forEach((h) => {
      const info = ocupadosDoDia.get(h);
      const estado = !info ? "livre" : info.bloqueado ? "bloqueado" : "agendado";
      const b = el("button", `slot ${estado}`, h);
      b.type = "button";
      b.disabled = estado === "agendado";
      b.title = { livre: "Toque para bloquear", bloqueado: "Toque para liberar", agendado: "Tem cliente agendado" }[estado];
      b.setAttribute("aria-pressed", String(estado === "bloqueado"));
      b.addEventListener("click", () => alternarHorario(dia, h, estado, b));
      grade.append(b);
    });
    box.append(el("p", "subgrupo", periodo.nome), grade);
  });
}

async function alternarHorario(dia, horario, estado, botao) {
  botao.disabled = true;
  const ref = db.collection("ocupados").doc(idDoHorario(dia, horario));
  try {
    if (estado === "livre") await ref.set({ data: dia, horario, bloqueado: true });
    else if (estado === "bloqueado") await ref.delete();
  } catch (erro) {
    // Se um cliente agendou esse horário no mesmo instante, o bloqueio é recusado.
    console.error(erro);
    $("erro").textContent = "Não foi possível alterar esse horário. Um cliente pode ter acabado de agendar nele; confira e tente de novo.";
    $("erro").hidden = false;
    botao.disabled = false;
  }
}

$("btnDiaInteiro").addEventListener("click", async () => {
  const dia = $("diaBloqueio").value;
  if (!dia) return;
  const hoje = agoraLocal().data;
  const bloqueando = !diasBloqueados.includes(dia);

  if (bloqueando) {
    const clientes = [...ocupadosDoDia.values()].filter((o) => !o.bloqueado).length;
    if (clientes > 0) {
      const ok = confirm(
        `Este dia já tem ${clientes} ${clientes === 1 ? "cliente agendado" : "clientes agendados"}.\n\n` +
        "Os agendamentos NÃO são cancelados automaticamente: avise os clientes e cancele na aba Próximos.\n\n" +
        "Bloquear o dia mesmo assim?"
      );
      if (!ok) return;
    }
  }

  // Guarda só as datas de hoje em diante (as antigas são descartadas).
  let lista = diasBloqueados.filter((d) => d >= hoje && d !== dia);
  if (bloqueando) lista.push(dia);
  lista.sort();
  try {
    await db.collection("config").doc("loja").set({ diasBloqueados: lista }, { merge: true });
  } catch (erro) {
    mostrarErro(erro);
  }
});

function ouvirBloqueiosDeHorario() {
  db.collection("ocupados").where("bloqueado", "==", true).onSnapshot((snap) => {
    bloqueiosDeHorario = snap.docs.map((d) => d.data());
    montarListaBloqueios();
  }, mostrarErro);
}

function montarListaBloqueios() {
  const box = $("listaBloqueios");
  const hoje = agoraLocal().data;
  box.innerHTML = "";

  const porData = {};
  diasBloqueados.filter((d) => d >= hoje).forEach((d) => (porData[d] = "dia"));
  bloqueiosDeHorario
    .filter((b) => b.data >= hoje && porData[b.data] !== "dia")
    .forEach((b) => (porData[b.data] ||= []).push(b.horario));

  const datas = Object.keys(porData).sort();
  if (datas.length === 0) {
    box.append(el("p", "vazio", "Nenhuma folga ou bloqueio marcado."));
    return;
  }

  datas.forEach((data) => {
    const item = el("article", "agendamento bloqueio");
    const info = el("div", "ag-info");
    info.append(el("strong", null, dataPorExtenso(data)));
    const valor = porData[data];
    info.append(el("span", "servico", valor === "dia" ? "Dia inteiro" : valor.sort().join(" · ")));

    const editar = el("button", "botao botao-secundario botao-pequeno", "Editar");
    editar.type = "button";
    editar.addEventListener("click", () => {
      $("diaBloqueio").value = data;
      escolherDiaBloqueio(data);
      $("diaBloqueio").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    item.append(info, editar);
    box.append(item);
  });
}

$("diaBloqueio").addEventListener("change", (e) => escolherDiaBloqueio(e.target.value));

// ---------- Abas ----------

document.querySelectorAll(".aba").forEach((aba) => {
  aba.addEventListener("click", () => {
    abaAtual = aba.dataset.aba;
    document.querySelectorAll(".aba").forEach((a) => a.setAttribute("aria-selected", String(a === aba)));
    const folgas = abaAtual === "folgas";
    $("folgas").hidden = !folgas;
    $("lista").hidden = folgas;
    if (!folgas) ouvirLista();
  });
});

let iniciado = false;
function iniciar() {
  if (iniciado) return;
  iniciado = true;
  $("diaBloqueio").min = agoraLocal().data;
  ouvirStatusDaLoja();
  ouvirLista();
  ouvirBloqueiosDeHorario();
  montarGradeBloqueio();
}
