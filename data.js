/* ============================================================================
 * AcroFlow — seed skill graph (static curriculum data for v1)
 * ----------------------------------------------------------------------------
 * This file defines window.SEED: the built-in library of L-base poses,
 * transitions, and flows that ships with the app.
 *
 * Every pose/transition/flow here was cross-checked against public references
 * (Partner Acrobatics manual, YogaSlackers library, Skilltaco catalog, and
 * named tutorial videos). Anything we could not defend is either left out or
 * explicitly marked "sequence unverified".
 *
 * Tutorial links were individually verified (fetched) on 2026-09-16. If a
 * link dies, the skill still works — tutorials are just links.
 *
 * DATA MODEL (also see README.md)
 *   poses:       { id, name, aliases[], discipline, difficulty 1-5,
 *                  description, safety:{risk, spotterRequired, notes},
 *                  tutorials:[{title,url,creator}], prereqPoses:[ids] }
 *   transitions: { id, name, from, to, aliases[], difficulty 1-5,
 *                  description, safety, tutorials[], prereqTransitions:[ids] }
 *   flows:       { id, name, steps:[poseIds], transitions:[ids|null aligned],
 *                  washingMachine:bool, origin:'seed'|'user', note,
 *                  tutorials:[{title,url,creator}], incomplete:bool }
 *                `incomplete` is only set on user flows added from a YouTube
 *                link: the video is saved as an unfinished draft (no steps)
 *                until its sequence is mapped in the Flow Builder.
 * ========================================================================== */

window.SEED = {
  version: "1.1.0",

  /* ------------------------------------------------------------------ */
  /* POSES (L-base only for v1)                                         */
  /* ------------------------------------------------------------------ */
  poses: [
    {
      id: "bird",
      name: "Bird",
      aliases: ["Front Bird", "Airplane"],
      discipline: "lbase",
      difficulty: 1,
      description: "The foundational L-base pose. The flyer lies prone (face-down) while the base's feet support the fronts of the flyer's hips. Almost everything in L-basing builds on a solid Bird.",
      safety: { risk: "low", spotterRequired: false, notes: "A spotter at the flyer's hips is still wise for the first few sessions." },
      tutorials: [
        { title: "How to do the Bird pose", url: "https://www.youtube.com/watch?v=bmktYLuksek", videoId: "bmktYLuksek", creator: "Acro Connection" },
        { title: "AcroYoga statics: 6 basic poses (bird, chair, foot to shin, whale, star)", url: "https://www.youtube.com/watch?v=at8uZGPpOmY", videoId: "at8uZGPpOmY", creator: "AcroYoga" }
      ],
      prereqPoses: []
    },
    {
      id: "throne",
      name: "Throne",
      aliases: ["Straddle Throne", "Classic Throne"],
      discipline: "lbase",
      difficulty: 1,
      description: "The flyer sits upright on the base's feet (feet on the flyer's inner thighs), torso vertical. A stable resting pose and the launchpad for many transitions.",
      safety: { risk: "low", spotterRequired: false, notes: "Keep the base's arms straight and stacked; spotter nearby while learning the mount." },
      tutorials: [
        { title: "AcroYoga Beginner Tutorial: Throne (4 entries + Bird to Throne)", url: "https://www.youtube.com/watch?v=8KZsfosPLZo", videoId: "8KZsfosPLZo", creator: "Noga / AcroNoga" },
        { title: "AcroYoga: Beginner Flow (whale, throne, bird)", url: "https://www.youtube.com/watch?v=KowDFJolg3E", videoId: "KowDFJolg3E", creator: "AcroYoga Slovakia" }
      ],
      prereqPoses: ["bird"]
    },
    {
      id: "chair",
      name: "Chair",
      aliases: [],
      discipline: "lbase",
      difficulty: 1,
      description: "Like a throne but the flyer sits higher and more upright, base's feet on the flyer's seat. A friendly beginner balance pose.",
      safety: { risk: "low", spotterRequired: false, notes: "Flyer keeps weight centered over the base's feet; spotter optional once stable." },
      tutorials: [
        { title: "AcroYoga statics: 6 basic poses (incl. chair)", url: "https://www.youtube.com/watch?v=at8uZGPpOmY", videoId: "at8uZGPpOmY", creator: "AcroYoga" }
      ],
      prereqPoses: []
    },
    {
      id: "tuck_sit",
      name: "Tuck Sit",
      aliases: ["L Sit", "Tuck Sit on Hands"],
      discipline: "lbase",
      difficulty: 1,
      description: "The flyer holds a tucked seated shape supported by the base's hands (or feet). A good first hand-balancing shape for the flyer.",
      safety: { risk: "low", spotterRequired: false, notes: "Base keeps arms straight; flyer practices controlled exits." },
      tutorials: [
        { title: "YogaSlackers Teacher Training Pre-Reqs (tuck sit on hands at 0:38)", url: "https://www.youtube.com/watch?v=zOEXQPghTCA", videoId: "zOEXQPghTCA", creator: "YogaSlackers" }
      ],
      prereqPoses: []
    },
    {
      id: "folded_leaf",
      name: "Folded Leaf",
      aliases: [],
      discipline: "lbase",
      difficulty: 1,
      description: "The flyer hangs folded forward over the base's feet, fully relaxed — the classic acro resting pose between efforts.",
      safety: { risk: "low", spotterRequired: false, notes: "No spotter needed; it's a rest pose. Base keeps a soft knee." },
      tutorials: [
        { title: "AcroYoga: Beginner Flow (folded leaf)", url: "https://www.youtube.com/watch?v=KowDFJolg3E", videoId: "KowDFJolg3E", creator: "AcroYoga Slovakia" },
        { title: "AcroYoga Essentials: straddle bat from folded leaf", url: "https://acroyoga-essentials.com/02-07.html", creator: "AcroYoga Essentials" }
      ],
      prereqPoses: ["bird"]
    },
    {
      id: "whale",
      name: "Whale",
      aliases: ["Flying Whale"],
      discipline: "lbase",
      difficulty: 2,
      description: "From throne, the flyer leans back onto the base's feet for a supported backbend. Feels amazing; demands trust and communication.",
      safety: { risk: "low", spotterRequired: true, notes: "Spotter shelves hands under the flyer's back/head. Move into it slowly." },
      tutorials: [
        { title: "AcroYoga: Beginner Flow (whale)", url: "https://www.youtube.com/watch?v=KowDFJolg3E", videoId: "KowDFJolg3E", creator: "AcroYoga Slovakia" },
        { title: "AcroYoga statics: 6 basic poses (incl. whale)", url: "https://www.youtube.com/watch?v=at8uZGPpOmY", videoId: "at8uZGPpOmY", creator: "AcroYoga" }
      ],
      prereqPoses: ["throne"]
    },
    {
      id: "reverse_bird",
      name: "Reverse Bird",
      aliases: ["Back Bird"],
      discipline: "lbase",
      difficulty: 2,
      description: "Like Bird but the flyer faces away from the base (prone, head away). The base's feet support the flyer's hips from behind. (Regional names vary — 'Back Bird' usually means this pose.)",
      safety: { risk: "low", spotterRequired: true, notes: "Spotter at the hips; the flyer can't see the base, so clear verbal cues matter." },
      tutorials: [
        { title: "Back Bird tutorial (beginner, with adjustments)", url: "https://www.youtube.com/watch?v=5ZiQP29Hek0", videoId: "5ZiQP29Hek0", creator: "Ulu Yoga Bali" }
      ],
      prereqPoses: ["bird"]
    },
    {
      id: "shoulder_stand",
      name: "Shoulder Stand",
      aliases: ["Shoulderstand on Feet"],
      discipline: "lbase",
      difficulty: 2,
      description: "The flyer is inverted with their shoulders resting on the base's feet, legs up. The gateway inversion of L-basing.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter guards the flyer's hips/legs. Flyer learns to bail to the side, never straight back onto the neck." },
      tutorials: [
        { title: "Acroloco AcroYoga Beginner's Guide (covers shoulderstand)", url: "https://www.youtube.com/watch?v=ntzWSPd46g4", videoId: "ntzWSPd46g4", creator: "Acroloco" }
      ],
      prereqPoses: ["bird"]
    },
    {
      id: "side_star",
      name: "Side Star",
      aliases: ["Inside Side Star"],
      discipline: "lbase",
      difficulty: 2,
      description: "The flyer balances sideways on one of the base's feet (foot on the flyer's hip), body in a straight side plank. Key pose inside the Ninja Star washing machine.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the flyer's hips; the sideways balance point is unfamiliar at first." },
      tutorials: [
        { title: "Inside Star mount & tick-tock calibration", url: "https://www.youtube.com/watch?v=gBSVH8tiiLU", videoId: "gBSVH8tiiLU", creator: "Lux (AcroYoga)" },
        { title: "Ninja Star tutorial (side star in sequence)", url: "https://www.youtube.com/watch?v=L8t-_hSdEj0", videoId: "L8t-_hSdEj0", creator: "Acro Adventure" }
      ],
      prereqPoses: ["bird"]
    },
    {
      id: "back_plank",
      name: "Back Plank",
      aliases: [],
      discipline: "lbase",
      difficulty: 2,
      description: "The flyer holds a rigid plank, face-up, supported by the base's feet and hands. A strong calibration pose for body tension.",
      safety: { risk: "med", spotterRequired: true, notes: "Flyer stays hollow and rigid; spotter near the shoulders." },
      tutorials: [
        { title: "Back plank to foot to hand (starts from back plank)", url: "https://www.youtube.com/watch?v=TprJFBwGnjs", videoId: "TprJFBwGnjs", creator: "Partner Acrobatics (Jacob Brown)" }
      ],
      prereqPoses: ["bird"]
    },
    {
      id: "foot_to_shin",
      name: "Foot to Shin",
      aliases: ["F2S", "Shin to Foot"],
      discipline: "lbase",
      difficulty: 2,
      description: "The flyer stands on the base's shins — a classic L-base balance pose and a stepping stone toward foot-to-hand skills.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the flyer's hips; flyer keeps weight over the base's feet." },
      tutorials: [
        { title: "YogaSlackers Teacher Training Pre-Reqs (shin to foot / foot to shin)", url: "https://www.youtube.com/watch?v=zOEXQPghTCA", videoId: "zOEXQPghTCA", creator: "YogaSlackers" }
      ],
      prereqPoses: ["bird"]
    },
    {
      id: "couch",
      name: "Couch",
      aliases: ["Vishnu's Couch"],
      discipline: "lbase",
      difficulty: 3,
      description: "The flyer reclines sideways across the base's feet like lounging on a couch — one of the most photogenic L-base poses.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter near the flyer's head side; enter slowly from throne." },
      tutorials: [],
      prereqPoses: ["throne"]
    },
    {
      id: "secretary",
      name: "Secretary",
      aliases: [],
      discipline: "lbase",
      difficulty: 3,
      description: "A throne-family pose where the flyer sits with legs to one side (like sitting sidesaddle at a desk). Shows up in Partner Acrobatics transitions to foot-to-hand.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the hips; the asymmetric shape is tippier than throne." },
      tutorials: [],
      prereqPoses: ["throne"]
    },
    {
      id: "star",
      name: "Star",
      aliases: ["Free Star"],
      discipline: "lbase",
      difficulty: 3,
      description: "The flyer is inverted, face-down, supported at the shoulders/upper arms by the base's feet, arms out like a star. The hub of many washing machines.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the flyer's hips/legs. Build up via shoulder stand first." },
      tutorials: [
        { title: "AcroYoga statics: 6 basic poses (incl. star)", url: "https://www.youtube.com/watch?v=at8uZGPpOmY", videoId: "at8uZGPpOmY", creator: "AcroYoga" },
        { title: "YogaSlackers Pre-Reqs (free star, star↔bird, star↔back flying)", url: "https://www.youtube.com/watch?v=zOEXQPghTCA", videoId: "zOEXQPghTCA", creator: "YogaSlackers" }
      ],
      prereqPoses: ["shoulder_stand"]
    },
    {
      id: "reverse_star",
      name: "Reverse Star",
      aliases: ["Reverse Shoulder Stand", "Reverse Shoulderstand on Feet"],
      discipline: "lbase",
      difficulty: 3,
      description: "Inverted like a star but the flyer faces the opposite direction (shoulders on the base's feet, head away). A Ninja Star-adjacent skill.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the legs; disorientation is common at first." },
      tutorials: [
        { title: "YogaSlackers Pre-Reqs (reverse star at 1:37)", url: "https://www.youtube.com/watch?v=zOEXQPghTCA", videoId: "zOEXQPghTCA", creator: "YogaSlackers" }
      ],
      prereqPoses: ["shoulder_stand"]
    },
    {
      id: "high_flying_whale",
      name: "High Flying Whale",
      aliases: [],
      discipline: "lbase",
      difficulty: 3,
      description: "A bigger, deeper whale — the base presses the flyer higher into the backbend. Beautiful but load-heavy for the base.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter shelves the flyer's back; base only attempts with a solid regular whale." },
      tutorials: [],
      prereqPoses: ["whale"]
    },
    {
      id: "straddle_bat",
      name: "Straddle Bat",
      aliases: ["Bat", "Straddlebat"],
      discipline: "lbase",
      difficulty: 3,
      description: "The flyer hangs fully inverted in a wide straddle, the base's feet on the inner thighs. A restful inversion and a core Ninja Star pose.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the flyer's hips until entries/exits are clean. Flyer keeps the straddle wide." },
      tutorials: [
        { title: "AcroYoga Beginner Tutorial: Straddle Bat", url: "https://www.youtube.com/watch?v=9m3Q8HeXaTY", videoId: "9m3Q8HeXaTY", creator: "Noga / AcroNoga" },
        { title: "Straddle Bat tutorial (written + video)", url: "https://lostartofhandbalancing.com/acroyoga-beginner-tutorial-straddle-bat/", creator: "Lost Art of Hand Balancing" }
      ],
      prereqPoses: ["bird"]
    },
    {
      id: "foot_to_hand",
      name: "Foot to Hand",
      aliases: ["F2H", "Low Foot to Hand"],
      discipline: "lbase",
      difficulty: 4,
      description: "The flyer handstands on the base's feet, hand-to-foot. The classic intermediate inversion — everything in advanced L-basing flows through here.",
      safety: { risk: "high", spotterRequired: true, notes: "Spotter REQUIRED, guarding the flyer's hips/legs. Enter from throne; never kick up cold." },
      tutorials: [
        { title: "YogaSlackers Pre-Reqs (low foot to hand at 0:47)", url: "https://www.youtube.com/watch?v=zOEXQPghTCA", videoId: "zOEXQPghTCA", creator: "YogaSlackers" },
        { title: "Reverse Foot to Hand tutorial (enter from throne, exit to bird)", url: "https://acrodemy.eu/2025/03/17/reverse-foot-to-hand-f2h-quick-easy-acroyoga-tutorial/", creator: "Acrodemy" }
      ],
      prereqPoses: ["throne", "shoulder_stand"]
    },
    {
      id: "hand_to_hand",
      name: "Hand to Hand",
      aliases: ["H2H", "Low Hand to Hand"],
      discipline: "lbase",
      difficulty: 4,
      description: "The flyer handstands on the base's hands, hand-to-hand. Less stable than foot-to-hand — the true test of straight-line handstands for both partners.",
      safety: { risk: "high", spotterRequired: true, notes: "Spotter REQUIRED. Both partners need solid straight-body handstand lines first." },
      tutorials: [
        { title: "Washing Machines Series 1 (incl. foot to shin → reverse hand to hand)", url: "https://www.youtube.com/watch?v=95Z0FAPIZGg", videoId: "95Z0FAPIZGg", creator: "Lauren Clausen & Scott Cooper" }
      ],
      prereqPoses: ["foot_to_hand"]
    }
  ],

  /* ------------------------------------------------------------------ */
  /* TRANSITIONS (directed edges between poses — tracked separately!)   */
  /* ------------------------------------------------------------------ */
  transitions: [
    {
      id: "t_bird_to_throne",
      name: "Bird → Throne",
      from: "bird",
      to: "throne",
      aliases: [],
      difficulty: 1,
      description: "From bird, the flyer folds up and sits back onto the base's feet into throne. The first transition most people learn.",
      safety: { risk: "low", spotterRequired: true, notes: "Spotter at the hips while the timing is new." },
      tutorials: [
        { title: "Throne tutorial (incl. Bird → Throne)", url: "https://www.youtube.com/watch?v=8KZsfosPLZo", videoId: "8KZsfosPLZo", creator: "Noga / AcroNoga" },
        { title: "Beginner AcroYoga class (foundational poses & transitions)", url: "https://www.youtube.com/watch?v=Qs7lWjwdogw", videoId: "Qs7lWjwdogw", creator: "AcroRoots" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_throne_to_bird",
      name: "Throne → Bird",
      from: "throne",
      to: "bird",
      aliases: [],
      difficulty: 1,
      description: "From throne, the flyer dives forward into the base's feet and extends into bird. The natural return trip.",
      safety: { risk: "low", spotterRequired: true, notes: "Flyer keeps arms connected to the base's hands until the feet land on the hips." },
      tutorials: [
        { title: "Beginner AcroYoga class (foundational poses & transitions)", url: "https://www.youtube.com/watch?v=Qs7lWjwdogw", videoId: "Qs7lWjwdogw", creator: "AcroRoots" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_bird_to_star",
      name: "Bird → Star",
      from: "bird",
      to: "star",
      aliases: [],
      difficulty: 3,
      description: "The flyer pikes/presses from bird up into the inverted star. A big milestone transition.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the hips; the flyer should already hold a clean shoulder stand." },
      tutorials: [
        { title: "YogaSlackers Pre-Reqs (bird → star at 1:08)", url: "https://www.youtube.com/watch?v=zOEXQPghTCA", videoId: "zOEXQPghTCA", creator: "YogaSlackers" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_star_to_bird",
      name: "Star → Bird",
      from: "star",
      to: "bird",
      aliases: [],
      difficulty: 3,
      description: "From the inverted star, the flyer lowers/rolls out into bird. Control on the way down is the whole skill.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter guides the hips down; no collapsing." },
      tutorials: [
        { title: "YogaSlackers Pre-Reqs (star → bird at 0:58)", url: "https://www.youtube.com/watch?v=zOEXQPghTCA", videoId: "zOEXQPghTCA", creator: "YogaSlackers" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_bird_to_side_star",
      name: "Bird → Side Star",
      from: "bird",
      to: "side_star",
      aliases: [],
      difficulty: 2,
      description: "The flyer shifts sideways off one hip onto a single foot of the base into side star. The entry used inside Ninja Star.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the hips; small, patient weight shifts." },
      tutorials: [
        { title: "Ninja Star tutorial (side star transitions)", url: "https://www.youtube.com/watch?v=L8t-_hSdEj0", videoId: "L8t-_hSdEj0", creator: "Acro Adventure" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_side_star_to_bird",
      name: "Side Star → Bird",
      from: "side_star",
      to: "bird",
      aliases: [],
      difficulty: 2,
      description: "From side star, the flyer re-centers onto both of the base's feet back into bird.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the hips; don't rush the re-centering." },
      tutorials: [
        { title: "Ninja Star tutorial (side star transitions)", url: "https://www.youtube.com/watch?v=L8t-_hSdEj0", videoId: "L8t-_hSdEj0", creator: "Acro Adventure" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_reverse_star_to_throne",
      name: "Reverse Star → Throne",
      from: "reverse_star",
      to: "throne",
      aliases: [],
      difficulty: 3,
      description: "The flyer comes down out of the inverted reverse star and lands seated in throne. Listed in the Partner Acrobatics manual.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter guides the descent; flyer lands softly, knees soft." },
      tutorials: [
        { title: "Rev. star to throne", url: "https://www.youtube.com/watch?v=D7DEqqNZMyQ", videoId: "D7DEqqNZMyQ", creator: "Partner Acrobatics (Jacob Brown)" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_throne_to_f2h",
      name: "Throne → Foot to Hand",
      from: "throne",
      to: "foot_to_hand",
      aliases: ["Throne to F2H"],
      difficulty: 4,
      description: "The classic foot-to-hand entry: from throne the flyer places hands on the base's feet and presses to handstand. The doorway to intermediate acro.",
      safety: { risk: "high", spotterRequired: true, notes: "Spotter REQUIRED at the flyer's hips/legs for every attempt while learning." },
      tutorials: [
        { title: "Reverse Straddle Throne → Low Foot-2-Hand", url: "https://acrodemy.eu/2025/03/22/from-reverse-straddle-throne-to-low-foot-2-hand/", creator: "Acrodemy" },
        { title: "Reverse Foot to Hand tutorial (enter from throne)", url: "https://acrodemy.eu/2025/03/17/reverse-foot-to-hand-f2h-quick-easy-acroyoga-tutorial/", creator: "Acrodemy" },
        { title: "Throne to f2h", url: "https://www.youtube.com/watch?v=P_ndZhMx0FU", videoId: "P_ndZhMx0FU", creator: "Partner Acrobatics (Jacob Brown)" }
      ],
      prereqTransitions: ["t_bird_to_throne"]
    },
    {
      id: "t_f2h_to_bird",
      name: "Foot to Hand → Bird",
      from: "foot_to_hand",
      to: "bird",
      aliases: ["F2H to Bird"],
      difficulty: 4,
      description: "Exiting the foot-to-hand handstand by lowering/rolling out into bird. As important as the entry.",
      safety: { risk: "high", spotterRequired: true, notes: "Spotter REQUIRED; flyer lowers with control, base absorbs with bent knees." },
      tutorials: [
        { title: "Reverse Foot to Hand tutorial (exit into bird)", url: "https://acrodemy.eu/2025/03/17/reverse-foot-to-hand-f2h-quick-easy-acroyoga-tutorial/", creator: "Acrodemy" }
      ],
      prereqTransitions: ["t_throne_to_f2h"]
    },
    {
      id: "t_star_to_reverse_bird",
      name: "Star → Reverse Bird",
      from: "star",
      to: "reverse_bird",
      aliases: ["Star to Back Bird"],
      difficulty: 4,
      description: "From star, the flyer rotates out over one shoulder into reverse bird. The key link of the Four Step washing machine.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter follows the rotation at the hips." },
      tutorials: [
        { title: "4 step (star → back bird → star)", url: "https://www.youtube.com/watch?v=y6mlhItALag", videoId: "y6mlhItALag", creator: "AcroJulie" }
      ],
      prereqTransitions: ["t_bird_to_star"]
    },
    {
      id: "t_reverse_bird_to_star",
      name: "Reverse Bird → Star",
      from: "reverse_bird",
      to: "star",
      aliases: ["Back Bird to Star"],
      difficulty: 4,
      description: "From reverse bird, the flyer inverts back up into star. Closes the Four Step loop.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the hips; base keeps feet active under the flyer's shoulders." },
      tutorials: [
        { title: "4 step (star → back bird → star)", url: "https://www.youtube.com/watch?v=y6mlhItALag", videoId: "y6mlhItALag", creator: "AcroJulie" }
      ],
      prereqTransitions: ["t_star_to_reverse_bird"]
    },
    {
      id: "t_side_star_to_straddle_bat",
      name: "Side Star → Straddle Bat",
      from: "side_star",
      to: "straddle_bat",
      aliases: [],
      difficulty: 4,
      description: "From side star, the flyer opens into the inverted straddle bat. A Ninja Star link.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the hips through the inversion." },
      tutorials: [
        { title: "Ninja Star tutorial (full sequence breakdown)", url: "https://www.youtube.com/watch?v=L8t-_hSdEj0", videoId: "L8t-_hSdEj0", creator: "Acro Adventure" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_straddle_bat_to_side_star",
      name: "Straddle Bat → Side Star",
      from: "straddle_bat",
      to: "side_star",
      aliases: [],
      difficulty: 4,
      description: "From the inverted straddle bat, the flyer closes back to one side into side star. A Ninja Star link.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the hips; flyer keeps the straddle wide until the foot lands." },
      tutorials: [
        { title: "Ninja Star tutorial (full sequence breakdown)", url: "https://www.youtube.com/watch?v=L8t-_hSdEj0", videoId: "L8t-_hSdEj0", creator: "Acro Adventure" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_side_star_to_reverse_bird",
      name: "Side Star → Reverse Bird",
      from: "side_star",
      to: "reverse_bird",
      aliases: [],
      difficulty: 4,
      description: "From side star, the flyer swings down and around into reverse bird. A Ninja Star link.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter follows the swing at the hips." },
      tutorials: [
        { title: "Ninja Star tutorial (full sequence breakdown)", url: "https://www.youtube.com/watch?v=L8t-_hSdEj0", videoId: "L8t-_hSdEj0", creator: "Acro Adventure" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_reverse_bird_to_side_star",
      name: "Reverse Bird → Side Star",
      from: "reverse_bird",
      to: "side_star",
      aliases: [],
      difficulty: 4,
      description: "From reverse bird, the flyer lifts back up to one side into side star, closing the Ninja Star loop.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the hips; deliberate, unhurried lift." },
      tutorials: [
        { title: "Ninja Star tutorial (full sequence breakdown)", url: "https://www.youtube.com/watch?v=L8t-_hSdEj0", videoId: "L8t-_hSdEj0", creator: "Acro Adventure" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_shoulderstand_to_straddle_bat",
      name: "Shoulder Stand → Straddle Bat",
      from: "shoulder_stand",
      to: "straddle_bat",
      aliases: [],
      difficulty: 4,
      description: "The base walks their feet from the flyer's shoulders out to the inner thighs as the flyer opens into straddle bat.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the hips; the base moves the feet, not the flyer." },
      tutorials: [
        { title: "Shoulderstand (forearm holds) → Straddle Bat", url: "https://acrodemy.eu/2025/03/11/from-shoulderstand-with-forearm-holds-to-straddle-bat/", creator: "Acrodemy" },
        { title: "Reverse Shoulderstand → Straddle Bat", url: "https://acrodemy.eu/2025/03/08/from-reverse-shoulderstand-to-straddle-bat/", creator: "Acrodemy" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_reverse_bird_to_straddle_bat",
      name: "Reverse Bird → Straddle Bat",
      from: "reverse_bird",
      to: "straddle_bat",
      aliases: ["Back Bird to Straddle Bat"],
      difficulty: 4,
      description: "From reverse bird, the flyer raises the legs into a straddle as the base's feet slide under the thighs into the bat.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the hips; flyer opens the straddle before the base releases the hands." },
      tutorials: [
        { title: "Back Bird → Straddle Bat", url: "https://acrodemy.eu/2025/03/10/from-back-bird-to-straddle-bat/", creator: "Acrodemy" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_secretary_to_f2h",
      name: "Secretary → Foot to Hand",
      from: "secretary",
      to: "foot_to_hand",
      aliases: ["Secretary to F2H"],
      difficulty: 4,
      description: "From the seated secretary, the flyer presses up to foot-to-hand. Listed in the Partner Acrobatics manual.",
      safety: { risk: "high", spotterRequired: true, notes: "Spotter REQUIRED; asymmetric start makes the press tippier." },
      tutorials: [],
      prereqTransitions: ["t_throne_to_f2h"]
    },
    {
      id: "t_back_plank_to_f2h",
      name: "Back Plank → Foot to Hand",
      from: "back_plank",
      to: "foot_to_hand",
      aliases: [],
      difficulty: 4,
      description: "From back plank, the flyer pikes up into foot-to-hand. Listed in the Partner Acrobatics manual.",
      safety: { risk: "high", spotterRequired: true, notes: "Spotter REQUIRED; needs strong hollow-body tension." },
      tutorials: [
        { title: "Back plank to foot to hand", url: "https://www.youtube.com/watch?v=TprJFBwGnjs", videoId: "TprJFBwGnjs", creator: "Partner Acrobatics (Jacob Brown)" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_star_to_h2h",
      name: "Star → Hand to Hand",
      from: "star",
      to: "hand_to_hand",
      aliases: ["Star to H2H"],
      difficulty: 5,
      description: "From star, the flyer's hands transfer from the base's feet to the base's hands into hand-to-hand. Advanced and humbling.",
      safety: { risk: "high", spotterRequired: true, notes: "Spotter REQUIRED, ideally experienced. Solid star and foot-to-hand first." },
      tutorials: [
        { title: "Star to hand to hand", url: "https://www.youtube.com/watch?v=QuURxWUNdXk", videoId: "QuURxWUNdXk", creator: "Partner Acrobatics (Jacob Brown)" }
      ],
      prereqTransitions: ["t_bird_to_star"]
    },
    {
      id: "t_side_star_to_star",
      name: "Side Star → Star",
      from: "side_star",
      to: "star",
      aliases: [],
      difficulty: 2,
      description: "From side star, the flyer squares up and presses into the inverted star. The middle link of the cork screw.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the hips; keep the press slow and stacked." },
      tutorials: [
        { title: "AcroYoga Essentials: Cork Screw (side star → star → side star)", url: "https://acroyoga-essentials.com/03-07.html", creator: "AcroYoga Essentials" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_star_to_side_star",
      name: "Star → Side Star",
      from: "star",
      to: "side_star",
      aliases: [],
      difficulty: 2,
      description: "From star, the flyer tips out to one side into side star. The exit link of the cork screw.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the hips; control the lateral tip." },
      tutorials: [
        { title: "AcroYoga Essentials: Cork Screw (side star → star → side star)", url: "https://acroyoga-essentials.com/03-07.html", creator: "AcroYoga Essentials" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_reverse_bird_to_f2h",
      name: "Reverse Bird → Foot to Hand",
      from: "reverse_bird",
      to: "foot_to_hand",
      aliases: ["Back Bird to F2H"],
      difficulty: 3,
      description: "From reverse bird, the flyer folds and stands up into the base's hands. The entry of the Trap Door washing machine.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the hips; base keeps elbows grounded as the flyer stands." },
      tutorials: [
        { title: "Acro Yoga Trap Door Tutorial (reverse bird → foot to hand → reverse bird)", url: "https://www.youtube.com/watch?v=UGFgdq38RQc", videoId: "UGFgdq38RQc", creator: "Yogafreq" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_f2h_to_reverse_bird",
      name: "Foot to Hand → Reverse Bird",
      from: "foot_to_hand",
      to: "reverse_bird",
      aliases: ["F2H to Back Bird"],
      difficulty: 3,
      description: "From foot to hand, the flyer hinges back down into reverse bird. The exit of the Trap Door washing machine.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the hips; slow hinge, no dropping." },
      tutorials: [
        { title: "Acro Yoga Trap Door Tutorial (reverse bird → foot to hand → reverse bird)", url: "https://www.youtube.com/watch?v=UGFgdq38RQc", videoId: "UGFgdq38RQc", creator: "Yogafreq" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_star_to_f2h",
      name: "Star → Foot to Hand",
      from: "star",
      to: "foot_to_hand",
      aliases: ["Star to F2H"],
      difficulty: 3,
      description: "From star, the flyer lowers/steps down into foot to hand. Used in Super Dave's beginner reverse-tumbleweed flow.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the hips; control the descent." },
      tutorials: [
        { title: "Beginner Acro Yoga Flow Sequence 5 (Super Dave) — written breakdown", url: "https://acrodemy.eu/2025/03/12/beginner-acro-yoga-flow-sequence-5-tutorial-with-super-dave/", creator: "Acrodemy / Super Dave" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_straddle_bat_to_star",
      name: "Straddle Bat → Star",
      from: "straddle_bat",
      to: "star",
      aliases: ["Bat to Star"],
      difficulty: 3,
      description: "From straddle bat, the flyer pikes/presses back up into star. Closes Super Dave's beginner reverse-tumbleweed flow.",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the hips; flyer keeps the straddle wide until stacked." },
      tutorials: [
        { title: "Beginner Acro Yoga Flow Sequence 5 (Super Dave) — written breakdown", url: "https://acrodemy.eu/2025/03/12/beginner-acro-yoga-flow-sequence-5-tutorial-with-super-dave/", creator: "Acrodemy / Super Dave" }
      ],
      prereqTransitions: []
    },
    {
      id: "t_star_to_straddle_bat",
      name: "Star → Straddle Bat",
      from: "star",
      to: "straddle_bat",
      aliases: ["Star to Bat"],
      difficulty: 3,
      description: "From star, the flyer folds forward into straddle bat. Appears in the AcroYoga Essentials final washing machine ('after the Star comes a Straddle Bat').",
      safety: { risk: "med", spotterRequired: true, notes: "Spotter at the hips; fold with control, don't drop." },
      tutorials: [
        { title: "AcroYoga Essentials: Final Washing Machine (written)", url: "https://acroyoga-essentials.com/03-08.html", creator: "AcroYoga Essentials" }
      ],
      prereqTransitions: []
    }
  ],

  /* ------------------------------------------------------------------ */
  /* FLOWS (poses linked into sequences; cycles = washing machines)     */
  /* ------------------------------------------------------------------ */
  flows: [
    {
      id: "f_ninja_star",
      name: "Ninja Star",
      steps: ["side_star", "straddle_bat", "side_star", "reverse_bird", "side_star"],
      transitions: ["t_side_star_to_straddle_bat", "t_straddle_bat_to_side_star", "t_side_star_to_reverse_bird", "t_reverse_bird_to_side_star"],
      washingMachine: true,
      origin: "seed",
      note: "The classic intermediate washing machine. Sequence follows the Acro Adventure tutorial; regional variations exist (some communities start from star or add pops).",
      tutorials: [
        { title: "Ninja Star tutorial (sequence: side star → straddle bat → side star → reversed bird)", url: "https://www.youtube.com/watch?v=L8t-_hSdEj0", videoId: "L8t-_hSdEj0", creator: "Acro Adventure" }
      ]
    },
    {
      id: "f_four_step",
      name: "Four Step",
      steps: ["star", "reverse_bird", "star"],
      transitions: ["t_star_to_reverse_bird", "t_reverse_bird_to_star"],
      washingMachine: true,
      origin: "seed",
      note: "Sequence per the AcroJulie '4 step' video (star → back bird → star, repeat). Different lineages teach different 'four steps' — treat this one as sequence-unverified for your community.",
      tutorials: [
        { title: "4 step (star → back bird → star, repeat)", url: "https://www.youtube.com/watch?v=y6mlhItALag", videoId: "y6mlhItALag", creator: "AcroJulie" }
      ]
    },
    {
      id: "f_barrel_roll",
      name: "Barrel Roll",
      steps: [],
      transitions: [],
      washingMachine: true,
      origin: "seed",
      note: "Sequence unverified — we did not want to guess the steps wrong. Learn it from the tutorial, then use the Flow Builder to record your community's version.",
      tutorials: [
        { title: "Barrel roll", url: "https://www.youtube.com/watch?v=ty7J2yF4h8w", videoId: "ty7J2yF4h8w", creator: "Partner Acrobatics (Jacob Brown)" },
        { title: "Acro Washing Machine Skill Test (incl. Barrel Roll & High Barrel Roll)", url: "https://www.youtube.com/watch?v=Hz49xyPPyZY", videoId: "Hz49xyPPyZY", creator: "Jacob Brown" },
        { title: "YogaSlackers acro library (Barrel Roll video)", url: "https://yogaslackers.com/explore/acro/library/", creator: "YogaSlackers" }
      ]
    },
    {
      id: "f_catherines_wheel",
      name: "Catherine's Wheel",
      steps: [],
      transitions: [],
      washingMachine: true,
      origin: "seed",
      note: "Sequence unverified — many variations exist. Learn it from a teacher or the references, then use the Flow Builder to record your version. Acrodemy's classic breakdown is video-only: https://acrodemy.eu/2025/03/15/catherines-wheel/.",
      tutorials: [
        { title: "100 most popular washing machines (incl. Catherine's Wheel)", url: "https://acrodemy.eu/category/acroyoga-sequence/intermediate-flows/100-most-popular-washing-machines/", creator: "Acrodemy" }
      ]
    },
    {
      id: "f_beginner_flow",
      name: "Beginner Flow",
      steps: ["whale", "throne", "folded_leaf", "bird"],
      transitions: [null, null, null],
      washingMachine: false,
      origin: "seed",
      note: "A gentle starter sequence adapted from the AcroYoga Slovakia beginner flow (whale → throne → … → bird). Some of these links have no named transition in our library yet — that's normal, and exactly what the '?' markers in the Flow Builder are for.",
      tutorials: [
        { title: "AcroYoga: Beginner Flow", url: "https://www.youtube.com/watch?v=KowDFJolg3E", videoId: "KowDFJolg3E", creator: "AcroYoga Slovakia" }
      ]
    },
    {
      id: "f_cork_screw",
      name: "Cork Screw",
      steps: ["bird", "side_star", "star", "side_star", "bird"],
      transitions: ["t_bird_to_side_star", "t_side_star_to_star", "t_star_to_side_star", "t_side_star_to_bird"],
      washingMachine: true,
      origin: "research",
      note: "Sequence per AcroYoga Essentials: bird → side star → star → side star → bird. Some lineages alternate sides each pass; this is the same-side version.",
      tutorials: [
        { title: "Corkscrew", url: "https://www.youtube.com/watch?v=lCNU_HBC4zo", videoId: "lCNU_HBC4zo", creator: "Partner Acrobatics (Jacob Brown)" },
        { title: "AcroYoga Essentials: Cork Screw (written)", url: "https://acroyoga-essentials.com/03-07.html", creator: "AcroYoga Essentials" }
      ]
    },
    {
      id: "f_trap_door",
      name: "Trap Door",
      steps: ["reverse_bird", "foot_to_hand", "reverse_bird"],
      transitions: ["t_reverse_bird_to_f2h", "t_f2h_to_reverse_bird"],
      washingMachine: true,
      origin: "research",
      note: "Sequence per the Yogafreq tutorial: reverse bird → foot to hand → back to reverse bird. A compact, repeatable beginner-intermediate machine.",
      tutorials: [
        { title: "Acro Yoga Trap Door Tutorial (reverse bird → foot to hand → reverse bird)", url: "https://www.youtube.com/watch?v=UGFgdq38RQc", videoId: "UGFgdq38RQc", creator: "Yogafreq" }
      ]
    },
    {
      id: "f_reverse_tumbleweed",
      name: "Reverse Tumbleweed (Beginner)",
      steps: ["star", "foot_to_hand", "reverse_bird", "straddle_bat", "star"],
      transitions: ["t_star_to_f2h", "t_f2h_to_reverse_bird", "t_reverse_bird_to_straddle_bat", "t_straddle_bat_to_star"],
      washingMachine: true,
      origin: "research",
      note: "Super Dave's beginner flow 5 via Acrodemy: star → low foot to hand → back bird → straddle bat → back to star. Described as a beginner-friendly, simplified reverse Tumbleweed.",
      tutorials: [
        { title: "Beginner Acro Yoga Flow Sequence 5 (Super Dave) — written breakdown", url: "https://acrodemy.eu/2025/03/12/beginner-acro-yoga-flow-sequence-5-tutorial-with-super-dave/", creator: "Acrodemy / Super Dave" }
      ]
    },
    {
      id: "f_final_wm_essentials",
      name: "Final Washing Machine",
      steps: ["reverse_star", "throne", "bird", "side_star", "star", "straddle_bat", "side_star", "straddle_bat", "side_star", "reverse_bird"],
      transitions: ["t_reverse_star_to_throne", "t_throne_to_bird", "t_bird_to_side_star", "t_side_star_to_star", "t_star_to_straddle_bat", "t_straddle_bat_to_side_star", "t_side_star_to_straddle_bat", "t_straddle_bat_to_side_star", "t_side_star_to_reverse_bird"],
      washingMachine: true,
      origin: "research",
      note: "Long combo from AcroYoga Essentials: reverse star → throne → bird → side star → star → straddle bat, then a full Ninja Star ending in reverse bird. An extended flow rather than a tight cycle.",
      tutorials: [
        { title: "AcroYoga Essentials: Final Washing Machine (written)", url: "https://acroyoga-essentials.com/03-08.html", creator: "AcroYoga Essentials" }
      ]
    },
    {
      id: "f_star_tumbler",
      name: "Star Tumbler",
      steps: [],
      transitions: [],
      washingMachine: true,
      origin: "research",
      note: "Sequence unverified — appears at 0:06 in the Washing Machines Series 1 video. Learn it from the video, then use the Flow Builder to record your version.",
      tutorials: [
        { title: "AcroYoga Washing Machines: Series 1 (Star Tumbler at 0:06)", url: "https://www.youtube.com/watch?v=95Z0FAPIZGg", videoId: "95Z0FAPIZGg", creator: "Lauren Clausen & Scott Cooper" }
      ]
    },
    {
      id: "f_mystery_box",
      name: "Mystery Box",
      steps: [],
      transitions: [],
      washingMachine: true,
      origin: "research",
      note: "Sequence unverified — appears at 2:15 in the Washing Machines Series 1 video. Learn it from the video, then use the Flow Builder to record your version.",
      tutorials: [
        { title: "AcroYoga Washing Machines: Series 1 (Mystery Box at 2:15)", url: "https://www.youtube.com/watch?v=95Z0FAPIZGg", videoId: "95Z0FAPIZGg", creator: "Lauren Clausen & Scott Cooper" }
      ]
    },
    {
      id: "f_musical_chairs",
      name: "Musical Chairs",
      steps: [],
      transitions: [],
      washingMachine: true,
      origin: "research",
      note: "Sequence unverified — appears at 1:39 in the Washing Machines Series 1 video. Learn it from the video, then use the Flow Builder to record your version.",
      tutorials: [
        { title: "AcroYoga Washing Machines: Series 1 (Musical Chairs at 1:39)", url: "https://www.youtube.com/watch?v=95Z0FAPIZGg", videoId: "95Z0FAPIZGg", creator: "Lauren Clausen & Scott Cooper" }
      ]
    },
    {
      id: "f_reverse_star_tumbler",
      name: "Reverse Star Tumbler",
      steps: [],
      transitions: [],
      washingMachine: true,
      origin: "research",
      note: "Sequence unverified — the mirror of Star Tumbler, appears at 0:55 in the Washing Machines Series 1 video. Learn it from the video, then use the Flow Builder to record your version.",
      tutorials: [
        { title: "AcroYoga Washing Machines: Series 1 (Reverse Star Tumbler at 0:55)", url: "https://www.youtube.com/watch?v=95Z0FAPIZGg", videoId: "95Z0FAPIZGg", creator: "Lauren Clausen & Scott Cooper" }
      ]
    },
    {
      id: "f_slacker_cycle",
      name: "Slacker Cycle",
      steps: [],
      transitions: [],
      washingMachine: true,
      origin: "research",
      note: "Sequence unverified — a slackro washing machine by YogaSlackers (Sam Salwei & Raquel Hernández-Cruz). Learn it from the video, then use the Flow Builder to record your version.",
      tutorials: [
        { title: "Slacker Cycle • A Slackro Washing Machine", url: "https://www.youtube.com/watch?v=z61UT-gF-i4", videoId: "z61UT-gF-i4", creator: "YogaSlackers" }
      ]
    },
    {
      id: "f_high_barrel_roll",
      name: "High Barrel Roll",
      steps: [],
      transitions: [],
      washingMachine: true,
      origin: "research",
      note: "Sequence unverified — the bigger brother of Barrel Roll, named in Jacob Brown’s 'Acro Washing Machine Skill Test' as one of the three washing machines used to test readiness for his intermediate workshops. Learn it from the video, then use the Flow Builder to record your version.",
      tutorials: [
        { title: "Acro Washing Machine Skill Test (incl. High Barrel Roll)", url: "https://www.youtube.com/watch?v=Hz49xyPPyZY", videoId: "Hz49xyPPyZY", creator: "Jacob Brown" }
      ]
    }
  ]
};
