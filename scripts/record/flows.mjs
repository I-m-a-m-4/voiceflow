/**
 * Flow scripts: coded click paths for the Zen AI demo.
 *
 * The scripts talk to `Page`, which resolves a spec to a rect in the live DOM and
 * then fires real CDP input events at it. Nothing here touches React or Firebase
 * — every step is something a person could do with a mouse and keyboard.
 *
 * Selectors are written against what the app actually renders. Where a control
 * has readable text the text is the selector; `css` is the escape hatch for
 * icon-only buttons, and each one below is pinned to a class combination that is
 * unique on its page — see the notes inline, because "looks unique" is how a
 * flow silently clicks the wrong thing.
 *
 * `ctx.commit` decides whether a flow performs its write. It defaults to false,
 * so a take against the wrong account cannot mutate its data; `--commit` opts
 * in for the real demo footage, and the captions change to match so the video
 * never claims something that did not happen.
 *
 * **Title cards are not here.** They live in `FLOW_CARDS` below and are played by
 * `record.mjs`, the same way a recipe's are — one path for both kinds, so the
 * studio can edit the opening and closing screen of any recording without a flow
 * having to opt in.
 *
 * The POS and inventory flows that used to live here were removed with the
 * retail features they demonstrated. New footage should be a recipe
 * (`record.mjs --recipe`) unless it genuinely needs coded logic.
 */

/**
 * The opening and closing screen of each coded flow.
 *
 * These are the first and last thing a viewer sees, so they are written as ad
 * copy rather than as labels: a claim on the open, the product name and a way to
 * act on the close. `record.mjs` plays them, and anything passed to `--cards`
 * (or set in the studio) overrides them per run — the wording is a marketing
 * decision that should not need a code change.
 */
export const FLOW_CARDS = {
  zen: {
    open: { title: '41 tools.', subtitle: 'Reads everything. Writes nothing without you.', ms: 2000 },
    end: {
      title: 'Zen AI',
      subtitle: 'Reads everything. Writes nothing without you.',
      cta: 'Try Zen AI',
      ms: 2600,
    },
  },
};

/** Routes each flow visits, so they can be compiled before the camera rolls. */
export const FLOW_ROUTES = {
  zen: ['/ai-insights'],
};

/**
 * Zen AI: ask a real question, watch real tools run against real data.
 *
 * The composer swaps placeholder once the thread opens ("Ask anything about your
 * business..." → "Ask Zen AI..."), which is the one reliable signal that the
 * message was actually sent — the status line cycles through generic copy until
 * a tool starts, so waiting on any particular status text is a coin flip.
 */
export async function zenFlow(page) {
  await page.goto('/ai-insights');
  await page.caption('Ask anything about your business.', 3400);

  // In on the composer while the question is typed — this is the one moment in
  // the take where the words on screen are the whole content of the shot.
  await page.punch({ placeholder: 'Ask anything about your business' }, { to: 1.26, ms: 700 });
  await page.fill(
    { placeholder: 'Ask anything about your business' },
    'Which products are about to run out?',
    { enter: true, delay: 62, settle: 900 },
  );

  await page.caption('It reads your live data — never a guess, never a generic answer.', 5200);
  await page.find({ placeholder: 'Ask Zen AI' }, { timeoutMs: 30_000 });
  // Back out for the answer. The reply streams top-down and the tool-status line
  // runs above it, so anything tighter than the full frame loses half of what
  // makes this shot worth having.
  await page.wide({ ms: 760 });
  await page.hold(10_500);

  await page.caption('Zen AI proposes. Nothing is written until you approve it.', 4200);
  await page.hold(2200);
  await page.caption('');
}

export const FLOWS = { zen: zenFlow };
