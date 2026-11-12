import { fireEvent, render, screen } from "@testing-library/react-native";
import { SettingsView } from "../../src/ui/settings-view";

describe("SettingsView", () => {
  it("shows the current SoundFont and fires Select", async () => {
    const onSelect = jest.fn();
    await render(<SettingsView soundFontName="gm.sf2" onSelect={onSelect} onClear={jest.fn()} />);
    expect(screen.getByText("gm.sf2")).toBeTruthy();
    await fireEvent.press(screen.getByText("Select SoundFont"));
    expect(onSelect).toHaveBeenCalled();
  });

  it("shows 'None selected.' and hides Clear when empty", async () => {
    await render(<SettingsView soundFontName={null} onSelect={jest.fn()} onClear={jest.fn()} />);
    expect(screen.getByText(/none selected/i)).toBeTruthy();
    expect(screen.queryByText("Clear")).toBeNull();
  });

  it("fires Clear when a SoundFont is set", async () => {
    const onClear = jest.fn();
    await render(<SettingsView soundFontName="gm.sf2" onSelect={jest.fn()} onClear={onClear} />);
    await fireEvent.press(screen.getByText("Clear"));
    expect(onClear).toHaveBeenCalled();
  });
});
