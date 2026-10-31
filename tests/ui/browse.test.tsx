import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { Library, LibraryStore, Song } from "../../src/library/store";
import { LibrariesView, LibraryDetailView } from "../../src/ui/library-view";

const library: Library = { id: 1, name: "Pop", path: "content://pop", songCount: 3, createdAt: 0 };

const allSongs: Song[] = [
  { id: 1, libraryId: 1, number: 1, title: "G1", singer: "S1", offset: 100, length: 80 },
  { id: 2, libraryId: 1, number: 2, title: "G2", singer: "S2", offset: 200, length: 109 },
  { id: 3, libraryId: 1, number: 3, title: "G3", singer: "S3", offset: 300, length: 88 },
];

function fakeStore(): LibraryStore {
  const searchSongs = jest.fn(async (query: string, limit = 50) => {
    const q = query.trim();
    const rows = q
      ? allSongs.filter((s) => s.title.includes(q) || s.singer.includes(q))
      : allSongs;
    return rows.slice(0, limit);
  });
  return {
    addLibrary: jest.fn(),
    listLibraries: jest.fn(async () => [library]),
    searchSongs,
    deleteLibrary: jest.fn(),
  };
}

describe("LibraryDetailView", () => {
  it("renders a library's songs and filters them by a query", async () => {
    const store = fakeStore();
    await render(<LibraryDetailView library={library} store={store} />);

    expect(await screen.findByText("G1")).toBeTruthy();
    expect(screen.getByText("G2")).toBeTruthy();
    expect(screen.getByText("G3")).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText(/search/i), "G2");

    await waitFor(() => expect(screen.queryByText("G1")).toBeNull());
    expect(screen.getByText("G2")).toBeTruthy();
    expect(screen.queryByText("G3")).toBeNull();
  });
});

describe("LibrariesView", () => {
  it("lists libraries and triggers import", async () => {
    const onImport = jest.fn();
    await render(<LibrariesView libraries={[library]} onImport={onImport} />);
    expect(screen.getByText("Pop")).toBeTruthy();
    expect(screen.getByText("3 songs")).toBeTruthy();
    fireEvent.press(screen.getByText("Import library"));
    expect(onImport).toHaveBeenCalled();
  });
});
