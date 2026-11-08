# Content and asset intelligence: engineering spec

Status: proposal for review. Nothing here is built unless the "Today" column says so.

## 1. Position

A video is only as good as what it says and what it shows. The renderer can make good material look professional; it cannot make weak or
wrong material compelling. So content and assets are a subsystem of their own, planned before anything is generated, not a media folder
inside the studio.

The proposal this spec answers makes four separations, and this spec adopts them:

1. **Content** (what is communicated) is not **entities** (who and what exists), which are not **assets** (media that represents them),
   which are not **usage** (where an asset appears).
2. Assets are **planned before they are generated**: requirements first, then acquisition, then review.
3. Acquisition has four strategies, chosen per asset: **retrieve**, **source**, **generate**, **create procedurally**. Generation does not
   always come first; an exact logo or product is retrieved, a chart is drawn.
4. The renderer resolves approved asset references. It does not own an asset's identity, provenance or history.

What this spec changes about the proposal: much of the model **already exists** in the repository, so the work is extending four schemas
and adding a coverage check, not introducing a parallel set of contracts. Section 3 says what to reuse; section 4 says what is new.

## 2. What exists today (checked in the code)

| Concern | Where | What it does |
|---|---|---|
| Content units | `packages/schema/src/content.ts` | `contentSchema`: `beats` (name, narration, onScreen, `claim`, `data[]`, `sourceIds`), `sources` (title, url, publisher, `retrievedAt`, verified `quote`). A claim without a source, a figure without a source, and a cited source without its quote all fail validation. |
| Script writing and checking | `packages/ai/src/content.ts` | Writes the script before design; claims must cite quotes that appear in the cited source. Required lines from the brief are checked on screen (`packages/ai/src/copy.ts`). |
| Entities | `packages/schema/src/production.ts` | `characters` (appearance, wardrobe, personality, voice, `referenceAssets`), `environments`, `props`, each with `referenceAssets`. Ids are unique and every reference must resolve. |
| Shots and usage | same | `productionShotSchema`: `characterIds`, `environmentId`, `propIds`, `beatId`, camera, `media`, `audio`. |
| Generation provenance | same | `shotGenerationSchema`: provider, model, prompt, negativePrompt, status (`planned` to `approved`), `jobId`, `assetId`, `referenceAssets`, cost, error. An `approved` take must name its `assetId`. |
| Approvals | same | `approvals[]` by stage: script, characters, storyboard, preview, final. |
| Compile | `packages/core/src/production.ts` | Shots with approved footage compile to footage; the rest compile to a text card from `onScreen`, so a plan can be watched before anything is generated. `productionSummary` already counts ready, approved and pending shots and unused beats. |
| Assets in a composition | `packages/schema/src/assets.ts` | `assetSchema`: `id`, `type` (image, video, audio, font, svg, captions, lottie), `src`, font fields, free-form `metadata`. |
| Safety of asset paths | `packages/ai/src/assets.ts`, `packages/assets/src` | A model cannot point a layer at a file nobody supplied; hosted compositions are confined to their own project. |
| Storage | `packages/storage/src` | `ProjectStore` with a filesystem implementation and an S3 one; tenants; `production.json` is a project file. |
| Studio | `apps/studio/src/pages/ProductionPlan.tsx` | A plan view with a "next steps" list: missing brief, beats no shot renders, takes to approve, shots that will compile as text cards. |

What does **not** exist: any provider that generates video (the `AiProvider` interface has chat, image, speech and transcription), a producer
of `shot.generation` records, rights or provenance on an asset, role-tagged references, asset requirements, a coverage view, continuity
rules, or any impact analysis when something changes. These are the real gaps.

## 3. Mapping the proposal onto the repository

| Proposal concept | Decision | Reason |
|---|---|---|
| `ContentUnit` | **Reuse `contentBeat`.** Add an optional `type` and `visual` intent; do not add a second unit type. | A beat already carries narration, on-screen copy, claim, data and sources, and shots already point at it by `beatId`. |
| `ProductionEntity` | **Reuse `characters`, `environments`, `props`.** Add `continuity` rules and a `locked` flag; add a `product` and `brand` entity only when a production needs them. | The three lists exist and validate. A single polymorphic entity table would break every existing manifest. |
| `Asset` | **Extend `assetSchema` backward-compatibly** with `provenance`, `rights`, `sha256`, `status` and `derivatives`. | The renderer needs only `id`, `type`, `src`; everything else is optional metadata. |
| `AssetUsage` | **Partly exists** (shot `media`, `audio`, `generation.referenceAssets`). Replace the plain id lists with **role-tagged references**. | Without a role the agent cannot tell which image is the character and which is the location. |
| `AssetRequirement` | **New**, in `production.json`. | Nothing records what is needed before a file exists. |
| Dependency graph | **Derive it; do not store it.** Compute impact from ids that already link shots to entities, beats and assets. | The links exist. A stored graph would drift from the manifest. |
| Provider capability contract | **New**, when the first video provider is added. | There is no video provider yet, so the contract can be designed from the first real adapter. |
| Asset library, search | **Filters over the asset manifest first.** No vector index. | The library is small and per project; structured filters answer the useful questions. |
| New packages (`production`, `media`, `editing`) | **Not yet.** Keep schemas in `@ove/schema`, planning in `@ove/core` and `@ove/ai`. Extract `@ove/media` when the registry has logic beyond a schema. | Packages without code to hold are overhead; the existing boundaries already match. |
| PostgreSQL, vector search | **Not yet.** The `ProjectStore` interface is the seam. | The hosted store already abstracts files; add a database when queries across projects are needed. |

## 4. What to build

### 4.1 Asset record: provenance, rights, integrity (P0)

Extend `assetSchema` with optional fields, so every existing composition and manifest stays valid:

```ts
sha256?: string;                     // stable identity of the bytes; detects a replaced file
status?: 'candidate' | 'approved' | 'rejected' | 'superseded';
parentAssetId?: string;              // derivative of, or a variation of
provenance?: {
  origin: 'upload' | 'generated' | 'licensed' | 'retrieved' | 'procedural' | 'recorded';
  sourceUrl?: string; creator?: string; acquiredAt?: string;
  provider?: string; model?: string; prompt?: string; inputAssetIds?: string[];
  licenseId?: string; attribution?: string;
};
rights?: {
  commercialUse: 'allowed' | 'restricted' | 'unknown';   // 'unknown' is the default and is never read as allowed
  consent?: 'granted' | 'not_required' | 'unknown';      // identifiable people and voices
  restrictions?: string[]; expiresAt?: string;
};
```

Rules: an asset with unknown rights is allowed in a draft and reported at export; a generated image is never recorded as `retrieved` or
archival; a logo or product shot declared `retrieved` is not replaced by a generated approximation by any route.

### 4.2 Role-tagged references (P0)

Today `referenceAssets` is a list of ids on characters, environments, props and shot generation. Replace each with
`Array<string | { asset: string; role: ReferenceRole }>` where a bare string means role `reference`:

`ReferenceRole = character | wardrobe | environment | product | style | storyboard | motion | first_frame | last_frame | voice | music | sfx`

Backward compatible by construction. The role is what a provider adapter maps to what its model accepts (section 4.6).

### 4.3 Asset requirements and coverage (P0)

A requirement says what is needed before an asset exists:

```ts
interface AssetRequirement {
  id: string;
  purpose: { shotId?: string; entityId?: string; beatId?: string };
  role: ReferenceRole | 'footage' | 'image' | 'audio' | 'graphic';
  strategy: 'retrieve' | 'source' | 'generate' | 'procedural';
  instruction?: string;            // "use the supplied product photography"
  assetId?: string;                // set when fulfilled
  status: 'missing' | 'candidate' | 'approved';
}
```

`productionSummary` gains a **coverage** result computed from requirements and approvals, not from file counts: per shot, which
required roles are approved, which are missing, which are only candidates; per entity, which references exist; per beat, whether a visual
requirement exists. The studio's plan "next steps" list reads it, so "78% ready" is never a count of uploaded files.

A planner step (`@ove/ai`) proposes requirements from a production type, the beats and the entities; it only proposes. A person or an
explicit setting approves, and the model never picks `generate` for an asset whose entry says `retrieve`.

### 4.4 Content typing and visual intent (P1)

Add optional `type` to a beat (`hook | narrative | dialogue | voiceover | fact | claim | quote | data | feature | cta`) and
`visual: { treatment: cinematic | animation | graphics | documentary | screen_capture | mixed; description?: string }`.

Content intelligence depends on production type, and `productionTypes` already exists. Each type gets its own checks, not its own schema:

- **documentary / explainer:** every claim needs a source with a quote (already enforced); generated illustrations are marked
  `illustrative` in provenance and cannot satisfy a requirement that asks for archival or evidence.
- **commercial:** product claims and specifications come from the supplied brand or product material.
- **cinematic / story:** entities carry `continuity` rules; coverage checks character and environment references per shot.

### 4.5 Dependency-aware change (P1)

Compute, do not store. A pure function `impactOf(production, change)` returns shots as `valid`, `needs review` or `invalid`:

- an entity reference or `continuity` change makes every shot using that entity `invalid` if it has a take generated from the old reference
  set, otherwise `needs review`;
- a beat's `onScreen` or `narration` change is `needs review`; a change to the shot `action` is `invalid`;
- a generation record stores the references and the prompt it used, so "stale" means the current references differ from the recorded ones.

It is conservative on purpose: a wording change with the same visual action never forces regeneration. The studio shows the result as a
list ("this reference is used by 8 shots in 3 scenes"); regeneration stays an explicit user action.

### 4.6 Provider capability contract (P1, with the first video provider)

Do not design from any one vendor. The adapter declares what it supports and must say what it dropped:

```ts
interface GenerationCapabilities { modes: GenerationMode[]; roles: ReferenceRole[]; maxReferences?: number; durations?: number[]; aspectRatios?: string[] }
interface GenerationResult { assetId: string; usedReferences: string[]; droppedReferences: { asset: string; why: string }[] }
```

A request names the mode (`text_to_video | image_to_video | reference_to_video | video_to_video | video_extend`) and role-tagged
references. An adapter that cannot honour a role returns it in `droppedReferences`; it never discards input silently. Reference limits and
supported modes are data the adapter reports, not constants in this repository. (Specific figures quoted for any vendor were not checked here;
read them from the provider's own documentation when its adapter is written.)

The result is written into `shot.generation` (provider, model, prompt, references, cost, status), which already exists and already requires
an `assetId` for `approved`.

### 4.7 Evaluation as separate dimensions (P1)

A candidate review is a record, not a score: `semanticFit`, `identity`, `composition`, `motion`, `quality`, `technical`, `rights`, each
`pass | concern | fail` with a note, plus a decision (`approve | approve_with_conditions | revise | reject`) and who made it. Technical
fitness (aspect, resolution, duration, frame rate) is computed; the rest start as a model's opinion and become decisions only when a person
records them. A locked entity or brand identity is never rewritten from a review.

### 4.8 Storage and retrieval (P2)

- A **project asset manifest** keyed by stable id with `sha256`, so an asset is referenced by id and never by an absolute path. The
  filesystem and S3 `ProjectStore` implementations hold the files; the hosted path stays tenant-scoped and confined as it is now.
- **Derivatives** (thumbnail, proxy, keyframes, waveform, transcript) are made on ingestion only where they apply, and recorded on the asset.
- **Search** is structured filters (type, entity, shot, role, status, origin, text and transcript) over the manifest. Add visual
  embeddings only when a library is large enough that filters stop answering the question.

## 5. Studio

Build on the plan view that exists. New surfaces, in order:

1. **Readiness** (in the plan view): coverage from 4.3, with each missing requirement as an action ("add or generate the engineer's side profile").
2. **Asset board**: by entity, and by requirement, so missing material is visible per shot.
3. **Asset inspector**: preview, provenance, rights, where it is used ("8 shots in 3 scenes"), generation history, review record.
4. **Content desk**: beats with their visual intent and linked requirements.

A generic media library is not on this list. Generation is always tied to an entity or a requirement, never a bare prompt.

## 6. Order of work

| Slice | Delivers | Acceptance |
|---|---|---|
| 1 | Asset record fields (4.1); `sha256` on ingestion | Every existing manifest and composition still validates; a test covers each new field; an asset with unknown rights is reported by validate, not blocked. |
| 2 | Role-tagged references (4.2) | Bare-string references still validate and compile; a role-tagged one resolves against `assets`. |
| 3 | `requirements` and coverage (4.3) in `productionSummary`, `production_validate` and the plan view | A production with a missing required role reports it; approving an asset clears it; coverage never counts a file that is not approved. |
| 4 | Requirement proposal (planner) | Proposes only; respects a `retrieve` entry; the proposal is a diff the user accepts. |
| 5 | `impactOf` (4.5) | Changing an entity reference marks exactly the shots that used it; a wording-only beat edit marks none invalid. |
| 6 | Capability contract and the first adapter (4.6, 4.7) | An adapter reports dropped references; a take records its references and prompt. |
| 7 | Asset board and inspector (section 5) | Per-shot coverage is visible without opening a shot. |

**Slice 1 is built.** The fields are in `packages/schema/src/assets.ts` (`provenance`, `rights`, `sha256`, `status`, `parentAssetId`), with
`assetNotes` (rights and consent) and `assetLinkProblems` (dangling parents and inputs, checked by the composition and production schemas).
`@ove/assets` has `fingerprintFile`, `sha256Of` and `verifyAssetHashes`. Where assets enter: a generated image records its provider,
model, prompt, hash and `rights: unknown`; an upload records its hash and time in `assets/.manifest.json` (dropped from the listing if the
file's size no longer matches, because the hash would then be a false statement). `validate` (CLI, MCP, and `production validate`) prints the
notes and never fails on them. Not yet covered: narration audio from the text-to-speech step (it is registered by a pure function that has no
provider or file to hash; it needs the same treatment where the audio file is written), template-library assets, and a way to record rights from
the studio. Rights stay `unknown` for generated media because what a provider's terms allow is not something this code can know.

Slices 1 to 3 need no provider and no model, so they can ship and be tested first. Do not start with a vector index or several video
providers: the data model and the lifecycle come first.

## 7. Not decided here

- Which video provider to adapt first, and its real capabilities (not verified in this repository).
- How rights are enforced in the **hosted** service (consent for real people and voices, licensed music, fonts): the fields above record
  them; the policy that blocks an export needs a product decision.
- Whether the asset manifest becomes a database table when hosted libraries are shared across projects.
