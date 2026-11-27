// Painel do barbeiro: ver/cancelar agendamentos e abrir/fechar a loja.

const $ = (id) => document.getElementById(id);

let lojaDisponivel = true;
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
    ? "Sua conta não tem permissão para ver os agendamentos. Veja no README como cadastrar o barbeiro no Firestore."
    : "Erro ao carregar os dados. Verifique sua internet.";
  box.hidden = false;
}

// ---------- Abrir / fechar a loja ----------

function ouvirStatusDaLoja() {
  db.collection("config").doc("loja").onSnapshot((doc) => {
    // Documento inexistente = loja aberta (mesma regra da página do cliente).
    lojaDisponivel = !(doc.exists && doc.data().disponivel === false);
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

// ---------- Abas ----------

document.querySelectorAll(".aba").forEach((aba) => {
  aba.addEventListener("click", () => {
    abaAtual = aba.dataset.aba;
    document.querySelectorAll(".aba").forEach((a) => a.setAttribute("aria-selected", String(a === aba)));
    ouvirLista();
  });
});

let iniciado = false;
function iniciar() {
  if (iniciado) return;
  iniciado = true;
  ouvirStatusDaLoja();
  ouvirLista();
}
