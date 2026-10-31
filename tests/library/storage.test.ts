import type { Library, LibraryStore } from "../../src/library/store";
import { formatBytes, formatUsage, libraryUsage } from "../../src/library/storage";

function fakeStore(libs: Array<Partial<Library>>): LibraryStore {
  const libraries = libs.map((l, i) => ({
    id: i + 1,
    name: `L${i + 1}`,
    path: `file:///l${i + 1}.hmp`,
    songCount: 0,
    createdAt: 0,
    ...l,
  })) as Library[];
  return {
    addLibrary: jest.fn(),
    listLibraries: jest.fn(async () => libraries),
    searchSongs: jest.fn(async () => []),
    deleteLibrary: jest.fn(),
  };
}

describe("formatBytes", () => {
  it("formats sub-kilobyte sizes in bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats larger sizes with one decimal and binary units", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1048576)).toBe("1.0 MB");
    expect(formatBytes(1073741824)).toBe("1.0 GB");
  });
});

describe("formatUsage", () => {
  it("summarises libraries, songs, and bytes (with singular forms)", () => {
    expect(formatUsage({ libraries: 1, songs: 1, bytes: 0 })).toBe("1 library · 1 song · 0 B");
    expect(formatUsage({ libraries: 2, songs: 5, bytes: 1536 })).toBe("2 libraries · 5 songs · 1.5 KB");
  });
});

describe("libraryUsage", () => {
  it("counts libraries, songs, and summed sizes", async () => {
    const store = fakeStore([{ songCount: 3, path: "file:///a.hmp" }, { songCount: 2, path: "file:///b.hmp" }]);
    const sizes: Record<string, number> = { "file:///a.hmp": 100, "file:///b.hmp": 250 };
    const usage = await libraryUsage(store, async (uri) => sizes[uri]);
    expect(usage).toEqual({ libraries: 2, songs: 5, bytes: 350 });
  });

  it("ignores sizes that cannot be read", async () => {
    const store = fakeStore([{ songCount: 1, path: "content://missing" }]);
    const usage = await libraryUsage(store, async () => {
      throw new Error("unreadable");
    });
    expect(usage).toEqual({ libraries: 1, songs: 1, bytes: 0 });
  });
});
