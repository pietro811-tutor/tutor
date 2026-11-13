import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, NavLink, Route, Routes } from "react-router-dom";
import "./stile.css";
import { leggiConfig, salvaConfig, ProviderDati, useDati, type Config } from "./stato";
import { leggiCopia, passwordSalvata } from "./copiaChiave";
import { Icone } from "./componenti";
import { carteDaRipassare } from "./piano";
import Benvenuto from "./schermate/Benvenuto";
import Oggi from "./schermate/Oggi";
import Programma from "./schermate/Programma";
import SchedaView from "./schermate/SchedaView";
import Ripasso from "./schermate/Ripasso";
import Carica from "./schermate/Carica";
import Materie from "./schermate/Materie";
import Interrogazione from "./schermate/Interrogazione";
import Lezione from "./schermate/Lezione";
import Impostazioni from "./schermate/Impostazioni";

function Navigazione() {
  const { schede, progressi } = useDati();
  const daRipassare = carteDaRipassare(schede, progressi).length;
  return (
    <nav className="navigazione">
      <NavLink to="/" end>
        {Icone.oggi}Oggi
      </NavLink>
      <NavLink to="/programma">
        {Icone.programma}Programma
      </NavLink>
      <NavLink to="/ripasso">
        <span className="pallino-nav" {...(daRipassare ? { "data-n": daRipassare } : {})}>
          {Icone.ripasso}
        </span>
        Ripasso
      </NavLink>
      <NavLink to="/carica">
        {Icone.carica}Carica
      </NavLink>
    </nav>
  );
}

// chiede al browser di non cancellare i dati dell'app (la chiave di accesso resta sul telefono)
try {
  void navigator.storage?.persist?.();
} catch {
  /* pazienza */
}

// aggiornamenti: appena c'e' una versione nuova l'app si ricarica da sola (e controlla ogni volta che la riapri)
if ("serviceWorker" in navigator) {
  const avevaGestore = !!navigator.serviceWorker.controller;
  let ricaricata = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!avevaGestore || ricaricata) return;
    ricaricata = true;
    location.reload();
  });
  void navigator.serviceWorker.ready.then((reg) => {
    const controlla = () => void reg.update().catch(() => {});
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") controlla();
    });
    window.setInterval(controlla, 30 * 60000);
    controlla();
  });
}

function App() {
  const [config, setConfig] = useState<Config | null>(leggiConfig());
  const [controllato, setControllato] = useState(!!leggiConfig() || import.meta.env.DEV);
  // se la chiave è sparita dal telefono, la ripristino dalla seconda copia
  useEffect(() => {
    if (controllato) return;
    void (async () => (await leggiCopia()) ?? (await passwordSalvata(false)))().then((c) => {
      if (c) {
        salvaConfig(c);
        setConfig(c);
      }
      setControllato(true);
    });
  }, [controllato]);
  if (!controllato) return null;
  // sul PC, in sviluppo, si puo' usare la cartella locale senza chiave
  if (!config && !import.meta.env.DEV) return <Benvenuto onPronto={setConfig} />;
  return (
    <ProviderDati config={config}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Oggi />} />
          <Route path="/programma" element={<Programma />} />
          <Route path="/scheda/:id" element={<SchedaView />} />
          <Route path="/ripasso" element={<Ripasso />} />
          <Route path="/carica" element={<Carica />} />
          <Route path="/materie" element={<Materie />} />
          <Route path="/interrogazione" element={<Interrogazione />} />
          <Route path="/lezione/:id" element={<Lezione />} />
          <Route path="/impostazioni" element={<Impostazioni onEsci={() => setConfig(null)} />} />
        </Routes>
        <Navigazione />
      </HashRouter>
    </ProviderDati>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
