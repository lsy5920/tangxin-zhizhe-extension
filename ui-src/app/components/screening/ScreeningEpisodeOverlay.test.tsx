import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CinemaMovie } from "../../cinema/types";
import { ScreeningEpisodeOverlay } from "./ScreeningEpisodeOverlay";

function episode(id: string, access: CinemaMovie["access"] = "free", price = 0): CinemaMovie {
  return {
    id,
    title: `合集第 ${id} 集`,
    posterUrl: "",
    creator: "合集",
    durationSeconds: 60,
    durationLabel: "1:00",
    orientation: "landscape",
    access,
    price,
    isCollection: true
  };
}

const callbacks = {
  onOpenChange: () => {},
  onSelectEpisode: () => {},
  onDownload: () => {},
  onAutoNextEnabledChange: () => {},
  onPlayNext: () => {},
  onCancelCountdown: () => {}
};

describe("screening episode overlay", () => {
  it("keeps download and collection controls directly on the video", () => {
    const html = renderToStaticMarkup(
      <ScreeningEpisodeOverlay
        {...callbacks}
        visible
        open
        episodes={[episode("1"), episode("2")]}
        currentMovieId="1"
        currentIndex={0}
        nextEpisode={episode("2")}
        autoNextEnabled
        ended={false}
        countdown={null}
      />
    );
    expect(html).toContain("下载");
    expect(html).toContain("选集 1/2");
    expect(html).toContain("data-txzz-episode-panel=\"true\"");
    expect(html).toContain("自动续播下一集");
  });

  it("shows a countdown for free episodes and a confirmation for coin episodes", () => {
    const freeHtml = renderToStaticMarkup(
      <ScreeningEpisodeOverlay {...callbacks} visible open={false} episodes={[episode("1"), episode("2")]} currentMovieId="1" currentIndex={0} nextEpisode={episode("2")} autoNextEnabled ended countdown={5} />
    );
    const paidHtml = renderToStaticMarkup(
      <ScreeningEpisodeOverlay {...callbacks} visible open={false} episodes={[episode("1"), episode("2", "coin", 3)]} currentMovieId="1" currentIndex={0} nextEpisode={episode("2", "coin", 3)} autoNextEnabled ended countdown={null} />
    );
    expect(freeHtml).toContain("5 秒后自动准备下一集");
    expect(paidHtml).toContain("下一集需 3 金币");
    expect(paidHtml).toContain("确认并检票");
  });
});
