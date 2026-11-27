// Configuração do Firebase (fica em um lugar só para as três páginas).
// Obs.: a apiKey do Firebase é pública por natureza — quem protege os dados
// são as regras do Firestore (arquivo firestore.rules).
const firebaseConfig = {
  apiKey: "AIzaSyDilIJ-viXxiEZLcMuCxUiRlOzIG59dxFc",
  authDomain: "sistemabarbeiro.firebaseapp.com",
  projectId: "sistemabarbeiro",
  storageBucket: "sistemabarbeiro.appspot.com",
  messagingSenderId: "142500598105",
  appId: "1:142500598105:web:a7883ed811e9d3b7c5bc48",
};

firebase.initializeApp(firebaseConfig);

const db = firebase.firestore ? firebase.firestore() : null;
const auth = firebase.auth ? firebase.auth() : null;
