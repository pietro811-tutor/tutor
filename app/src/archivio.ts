// Come l'app legge e scrive i dati: su GitHub (archivio privato) oppure,
// durante lo sviluppo sul PC, nella cartella locale ../dati.

export interface VoceAlbero {
  path: string;
  sha: string;
  size?: number;
}

export interface Archivio {
  albero(): Promise<VoceAlbero[]>;
  leggiTesto(path: string): Promise<string | null>;
  leggiBinario(path: string): Promise<Blob | null>;
  scrivi(path: string, base64: string, messaggio: string): Promise<void>;
}

export class ErroreArchivio extends Error {
  constructor(
    message: string,
    public stato?: number,
  ) {
    super(message);
  }
}

const percorsoUrl = (p: string) => p.split("/").map(encodeURIComponent).join("/");

export class ArchivioGitHub implements Archivio {
  private shaNoti = new Map<string, string>();
  constructor(
    private token: string,
    private repo: string, // "proprietario/nome"
    private ramo = "main",
  ) {}

  private async chiama(url: string, init: RequestInit = {}) {
    const r = await fetch(`https://api.github.com/repos/${this.repo}${url}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.headers ?? {}),
      },
    });
    return r;
  }

  async verifica() {
    const r = await this.chiama("");
    if (r.status === 401) throw new ErroreArchivio("La chiave non è valida.", 401);
    if (r.status === 404) throw new ErroreArchivio("Non trovo l'archivio (o la chiave non lo vede).", 404);
    if (!r.ok) throw new ErroreArchivio(`GitHub risponde ${r.status}`, r.status);
  }

  async albero() {
    const r = await this.chiama(`/git/trees/${this.ramo}?recursive=1`);
    if (r.status === 409 || r.status === 404) return []; // archivio vuoto
    if (!r.ok) throw new ErroreArchivio(`Non riesco a leggere l'archivio (${r.status})`, r.status);
    const dati = (await r.json()) as { tree: { path: string; sha: string; size?: number; type: string }[] };
    const voci = dati.tree.filter((v) => v.type === "blob").map(({ path, sha, size }) => ({ path, sha, size }));
    this.shaNoti = new Map(voci.map((v) => [v.path, v.sha]));
    return voci;
  }

  async leggiTesto(path: string) {
    const r = await this.chiama(`/contents/${percorsoUrl(path)}?ref=${this.ramo}`, {
      headers: { Accept: "application/vnd.github.raw+json" },
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new ErroreArchivio(`Non riesco a leggere ${path} (${r.status})`, r.status);
    return await r.text();
  }

  async leggiBinario(path: string) {
    const r = await this.chiama(`/contents/${percorsoUrl(path)}?ref=${this.ramo}`, {
      headers: { Accept: "application/vnd.github.raw+json" },
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new ErroreArchivio(`Non riesco a leggere ${path} (${r.status})`, r.status);
    return await r.blob();
  }

  private async shaAttuale(path: string) {
    const r = await this.chiama(`/contents/${percorsoUrl(path)}?ref=${this.ramo}`);
    if (r.status === 404) return undefined;
    if (!r.ok) throw new ErroreArchivio(`Errore ${r.status}`, r.status);
    return ((await r.json()) as { sha: string }).sha;
  }

  async scrivi(path: string, base64: string, messaggio: string) {
    for (let tentativo = 0; tentativo < 3; tentativo++) {
      const sha = tentativo === 0 ? this.shaNoti.get(path) : await this.shaAttuale(path);
      const r = await this.chiama(`/contents/${percorsoUrl(path)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messaggio, content: base64, branch: this.ramo, ...(sha ? { sha } : {}) }),
      });
      if (r.ok) {
        const dati = (await r.json()) as { content?: { sha: string } };
        if (dati.content) this.shaNoti.set(path, dati.content.sha);
        return;
      }
      // 409/422: qualcuno ha scritto nel frattempo, riprovo con lo sha giusto
      if (r.status !== 409 && r.status !== 422) throw new ErroreArchivio(`Non riesco a salvare (${r.status})`, r.status);
    }
    throw new ErroreArchivio("Non riesco a salvare, riprova tra poco.");
  }
}

export class ArchivioLocale implements Archivio {
  async albero() {
    const r = await fetch("/dev-archivio", { cache: "no-store" });
    return (await r.json()) as VoceAlbero[];
  }
  async leggiTesto(path: string) {
    const r = await fetch(`/dev-archivio?path=${encodeURIComponent(path)}`, { cache: "no-store" });
    if (r.status === 404) return null;
    return await r.text();
  }
  async leggiBinario(path: string) {
    const r = await fetch(`/dev-archivio?path=${encodeURIComponent(path)}`, { cache: "no-store" });
    return r.ok ? await r.blob() : null;
  }
  async scrivi(path: string, base64: string) {
    const r = await fetch(`/dev-archivio?path=${encodeURIComponent(path)}`, { method: "PUT", body: base64 });
    if (!r.ok) throw new ErroreArchivio("Errore nel salvataggio locale");
  }
}

export function testoInBase64(testo: string) {
  const byte = new TextEncoder().encode(testo);
  let binario = "";
  for (let i = 0; i < byte.length; i += 0x8000) binario += String.fromCharCode(...byte.subarray(i, i + 0x8000));
  return btoa(binario);
}

export function fileInBase64(file: Blob): Promise<string> {
  return new Promise((ok, ko) => {
    const lettore = new FileReader();
    lettore.onload = () => ok(String(lettore.result).split(",")[1] ?? "");
    lettore.onerror = () => ko(lettore.error);
    lettore.readAsDataURL(file);
  });
}
