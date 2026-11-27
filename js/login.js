// Login do barbeiro (Firebase Authentication com e-mail e senha).

const $ = (id) => document.getElementById(id);

// Se já estiver logado, vai direto para o painel.
auth.onAuthStateChanged((usuario) => {
  if (usuario) location.replace("barbeiro.html");
});

function mensagem(tipo, texto) {
  $("erro").hidden = true;
  $("ok").hidden = true;
  if (!texto) return;
  $(tipo).textContent = texto;
  $(tipo).hidden = false;
}

function traduzirErro(erro) {
  switch (erro.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "E-mail ou senha incorretos.";
    case "auth/invalid-email":
      return "E-mail inválido.";
    case "auth/too-many-requests":
      return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
    case "auth/network-request-failed":
      return "Sem conexão com a internet.";
    default:
      return "Não foi possível entrar. Tente novamente.";
  }
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("email").value.trim();
  const senha = $("senha").value;
  if (!email || !senha) return mensagem("erro", "Preencha e-mail e senha.");

  const botao = $("btnEntrar");
  botao.disabled = true;
  botao.textContent = "Entrando…";
  mensagem();
  try {
    await auth.signInWithEmailAndPassword(email, senha);
    location.replace("barbeiro.html");
  } catch (erro) {
    console.error(erro);
    mensagem("erro", traduzirErro(erro));
    botao.disabled = false;
    botao.textContent = "Entrar";
  }
});

$("btnEsqueci").addEventListener("click", async () => {
  const email = $("email").value.trim();
  if (!email) {
    $("email").focus();
    return mensagem("erro", "Digite seu e-mail acima e clique de novo em “Esqueci minha senha”.");
  }
  try {
    await auth.sendPasswordResetEmail(email);
    mensagem("ok", "Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.");
  } catch (erro) {
    console.error(erro);
    mensagem("erro", traduzirErro(erro));
  }
});
