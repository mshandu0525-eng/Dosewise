<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Medication scheduling and adherence logic lives in pure functions in `src/lib/meds.ts` (tested in `meds.test.ts`); pages only render it. Why: keeps rules testable and portable to a native app.
- Prototype data is stored on-device (localStorage) with no backend. Why: the brief asks for local-first storage; a HIPAA backend needs a BAA-covered host.
