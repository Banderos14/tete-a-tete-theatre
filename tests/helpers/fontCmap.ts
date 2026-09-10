// Минимальный разбор таблицы cmap шрифта: TTF/OTF (sfnt), WOFF и WOFF2.
// Нужен, чтобы тесты проверяли РЕАЛЬНОЕ покрытие глифов в файле, а не наши
// предположения о нём.

import { readFileSync } from 'node:fs';
import { inflateSync, brotliDecompressSync } from 'node:zlib';

const WOFF2_KNOWN_TAGS = [
  'cmap','head','hhea','hmtx','maxp','name','OS/2','post','cvt ','fpgm','glyf','loca',
  'prep','CFF ','VORG','EBDT','EBLC','gasp','hdmx','kern','LTSH','PCLT','VDMX','vhea',
  'vmtx','BASE','GDEF','GPOS','GSUB','EBSC','JSTF','MATH','CBDT','CBLC','COLR','CPAL',
  'SVG ','sbix','acnt','avar','bdat','bloc','bsln','cvar','fdsc','feat','fmtx','fvar',
  'gvar','hsty','just','lcar','mort','morx','opbd','prop','trak','Zapf','Silf','Glat',
  'Gloc','Feat','Sill',
];

function sfntTables(buf: Buffer): Record<string, Buffer> {
  const tables: Record<string, Buffer> = {};
  const numTables = buf.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const o   = 12 + i * 16;
    const tag = buf.toString('latin1', o, o + 4);
    tables[tag] = buf.subarray(buf.readUInt32BE(o + 8), buf.readUInt32BE(o + 8) + buf.readUInt32BE(o + 12));
  }
  return tables;
}

function woffTables(buf: Buffer): Record<string, Buffer> {
  const tables: Record<string, Buffer> = {};
  const numTables = buf.readUInt16BE(12);
  for (let i = 0; i < numTables; i++) {
    const o        = 44 + i * 20;
    const tag      = buf.toString('latin1', o, o + 4);
    const offset   = buf.readUInt32BE(o + 4);
    const compLen  = buf.readUInt32BE(o + 8);
    const origLen  = buf.readUInt32BE(o + 12);
    const slice    = buf.subarray(offset, offset + compLen);
    tables[tag] = compLen !== origLen ? inflateSync(slice) : slice;
  }
  return tables;
}

function readBase128(buf: Buffer, cursor: { o: number }): number {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const b = buf[cursor.o++]!;
    value = (value << 7) | (b & 0x7f);
    if (!(b & 0x80)) return value;
  }
  throw new Error('invalid base128 value');
}

function woff2Tables(buf: Buffer): Record<string, Buffer> {
  const numTables       = buf.readUInt16BE(12);
  const totalCompressed = buf.readUInt32BE(20);
  const cursor          = { o: 48 };
  const dir: { tag: string; transLen: number }[] = [];

  for (let i = 0; i < numTables; i++) {
    const flags = buf[cursor.o++]!;
    let tag: string;
    if ((flags & 0x3f) === 0x3f) { tag = buf.toString('latin1', cursor.o, cursor.o + 4); cursor.o += 4; }
    else                          { tag = WOFF2_KNOWN_TAGS[flags & 0x3f]!; }

    const transform   = (flags >> 6) & 3;
    const origLen     = readBase128(buf, cursor);
    const transformed = (tag === 'glyf' || tag === 'loca') ? transform === 0 : transform !== 0;
    const transLen    = transformed ? readBase128(buf, cursor) : origLen;
    dir.push({ tag, transLen });
  }

  const raw = brotliDecompressSync(buf.subarray(cursor.o, cursor.o + totalCompressed));
  const tables: Record<string, Buffer> = {};
  let offset = 0;
  for (const t of dir) { tables[t.tag] = raw.subarray(offset, offset + t.transLen); offset += t.transLen; }
  return tables;
}

function codepointsFromCmap(cmap: Buffer): Set<number> {
  const set = new Set<number>();
  const numSubtables = cmap.readUInt16BE(2);
  let best: number | null = null;

  for (let i = 0; i < numSubtables; i++) {
    const o   = 4 + i * 8;
    const pid = cmap.readUInt16BE(o);
    const eid = cmap.readUInt16BE(o + 2);
    if ((pid === 3 && (eid === 1 || eid === 10)) || pid === 0) best = cmap.readUInt32BE(o + 4);
  }
  if (best === null) return set;

  const off = best;
  const fmt = cmap.readUInt16BE(off);

  if (fmt === 4) {
    const segX2  = cmap.readUInt16BE(off + 6);
    const segs   = segX2 / 2;
    const endO   = off + 14;
    const startO = endO + segX2 + 2;
    const deltaO = startO + segX2;
    const rangeO = deltaO + segX2;
    for (let s = 0; s < segs; s++) {
      const end   = cmap.readUInt16BE(endO + s * 2);
      const start = cmap.readUInt16BE(startO + s * 2);
      const delta = cmap.readInt16BE(deltaO + s * 2);
      const ro    = cmap.readUInt16BE(rangeO + s * 2);
      if (start === 0xffff) continue;
      for (let cp = start; cp <= end; cp++) {
        let gid: number;
        if (ro === 0) gid = (cp + delta) & 0xffff;
        else {
          const gi = rangeO + s * 2 + ro + (cp - start) * 2;
          if (gi + 1 >= cmap.length) continue;
          gid = cmap.readUInt16BE(gi);
          if (gid !== 0) gid = (gid + delta) & 0xffff;
        }
        if (gid !== 0) set.add(cp);
      }
    }
  } else if (fmt === 12) {
    const nGroups = cmap.readUInt32BE(off + 12);
    for (let i = 0; i < nGroups; i++) {
      const o = off + 16 + i * 12;
      for (let cp = cmap.readUInt32BE(o); cp <= cmap.readUInt32BE(o + 4); cp++) set.add(cp);
    }
  }
  return set;
}

export function fontCodepoints(path: string): Set<number> {
  const buf = readFileSync(path);
  const sig = buf.toString('latin1', 0, 4);
  const tables =
    sig === 'wOF2' ? woff2Tables(buf) :
    sig === 'wOFF' ? woffTables(buf)  :
                     sfntTables(buf);
  const cmap = tables['cmap'];
  if (!cmap) throw new Error(`no cmap table in ${path}`);
  return codepointsFromCmap(cmap);
}

export function missingChars(path: string, chars: string): string[] {
  const cps = fontCodepoints(path);
  return [...chars].filter(ch => !cps.has(ch.codePointAt(0)!));
}
