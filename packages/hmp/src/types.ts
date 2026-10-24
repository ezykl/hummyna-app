export interface SongRef {
  number: number;
  title: string;
  singer: string;
  offset: number;
  length: number;
}

export interface LibraryKeys {
  wrapPrivateJwk: JsonWebKey;
  signPublicJwk: JsonWebKey;
}

export interface HmpLibrary {
  songCount: number;
  songs(): SongRef[];
  verify(): Promise<boolean>;
  midiFor(ref: SongRef): Promise<Uint8Array>;
}
