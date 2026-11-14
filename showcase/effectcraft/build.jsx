// Built headless with effectcraft-cli: effectcraft-cli script build.jsx --empty --save-as showcase.ecproj
// A 10 s vertical piece: gradient + animated noise + vignette, a glowing title with a light sweep, two counters, a closing line.
var W = 1080, H = 1920, FPS = 30, DUR = 10;
var comp = app.project.items.addComp("Showcase", W, H, 1, DUR, FPS);

var WHITE = [0.97, 0.98, 1, 1], SKY = [0.49, 0.83, 0.99, 1], PINK = [1, 0.36, 0.78, 1];

function fx(layer, name) { return layer.property("Effects").addProperty(name); }
function xf(layer, name) { return layer.property("Transform").property(name); }
function show(layer, a, b) { layer.inPoint = a; layer.outPoint = b; }

// ---- background
var bg = comp.layers.addSolid([0.02, 0.03, 0.09], "Background", W, H, 1);
var ramp = fx(bg, "Gradient Ramp");
ramp.property("Start of Ramp").setValue([W / 2, 0]);
ramp.property("Start Color").setValue([0.05, 0.06, 0.22, 1]);
ramp.property("End of Ramp").setValue([W / 2, H]);
ramp.property("End Color").setValue([0.20, 0.04, 0.22, 1]);

var noise = comp.layers.addSolid([0.5, 0.5, 0.5], "Noise", W, H, 1);
var nz = fx(noise, "Fractal Noise");
nz.property("Contrast").setValue(160);
nz.property("Brightness").setValue(-30);
nz.property("Evolution").setValueAtTime(0, 0);
nz.property("Evolution").setValueAtTime(DUR, 720);
xf(noise, "Opacity").setValue(14);
try { noise.blendingMode = BlendingMode.ADD; } catch (e) { writeLn("blend mode: " + e); }

// ---- an accent line that draws across between the sections
function accent(name, y, a, b, color) {
  var l = comp.layers.addSolid(color, name, 700, 6, 1);
  xf(l, "Position").setValue([W / 2, y]);
  var s = xf(l, "Scale");
  s.setValueAtTime(a, [0, 100]);
  s.setValueAtTime(a + 0.7, [100, 100]);
  s.setValueAtTime(b - 0.4, [100, 100]);
  s.setValueAtTime(b, [0, 100]);
  show(l, a, b);
  return l;
}

// ---- text
function words(name, content, size, color, y, a, b, rise) {
  var t = comp.layers.addText(content);
  t.name = name;
  var doc = t.property("Text").property("Source Text").value;
  doc.fontSize = size;
  doc.fillColor = [color[0], color[1], color[2]];
  try { doc.justification = ParagraphJustification.CENTER_JUSTIFY; } catch (e) {}
  t.property("Text").property("Source Text").setValue(doc);
  var p = xf(t, "Position");
  p.setValueAtTime(a, [W / 2, y + rise]);
  p.setValueAtTime(a + 0.9, [W / 2, y]);
  p.setValueAtTime(b, [W / 2, y - 24]);
  var o = xf(t, "Opacity");
  o.setValueAtTime(a, 0);
  o.setValueAtTime(a + 0.5, 100);
  o.setValueAtTime(b - 0.5, 100);
  o.setValueAtTime(b, 0);
  show(t, a, b);
  return t;
}

// 1. title, with glow and a light sweep
var title = words("Title", "EFFECT\rCRAFT", 190, WHITE, 900, 0.3, 3.4, 60);
var glow = fx(title, "Glow");
glow.property("Glow Threshold").setValue(35);
glow.property("Glow Radius").setValue(45);
glow.property("Glow Intensity").setValue(1.4);
var sweep = fx(title, "CC Light Sweep");
sweep.property("Direction").setValue(-30);
sweep.property("Width").setValue(70);
sweep.property("Sweep Intensity").setValue(80);
sweep.property("Center").setValueAtTime(1.0, [-200, 900]);
sweep.property("Center").setValueAtTime(2.4, [W + 200, 900]);
accent("Line 1", 1215, 1.2, 3.4, SKY);
words("Subtitle", "motion graphics, built by an agent", 46, [0.7, 0.78, 0.95], 1320, 1.6, 3.4, 30);

// 2. first counter
words("Count 1", "763", 330, SKY, 820, 3.2, 5.6, 80);
accent("Line 2", 1050, 3.5, 5.6, PINK);
words("Label 1", "engine commands", 64, WHITE, 1160, 3.7, 5.6, 40);

// 3. second counter
words("Count 2", "308", 330, PINK, 820, 5.4, 7.8, 80);
accent("Line 3", 1050, 5.7, 7.8, SKY);
words("Label 2", "effects, scriptable from JavaScript", 56, WHITE, 1160, 5.9, 7.8, 40);

// 4. close
var closing = words("Close", "Scripted.\rRendered.\rHeadless.", 150, WHITE, 900, 7.6, 10, 70);
var g2 = fx(closing, "Glow");
g2.property("Glow Threshold").setValue(40);
g2.property("Glow Radius").setValue(35);
g2.property("Glow Intensity").setValue(1.2);

// ---- vignette over everything
var vig = comp.layers.addSolid([0, 0, 0], "Vignette", W, H, 1);
try { vig.adjustmentLayer = true; } catch (e) { writeLn("adjustment: " + e); }
var v = fx(vig, "Vignette");
v.property("Amount").setValue(60);

writeLn("layers: " + comp.numLayers + ", duration " + comp.duration + " s");
