// Icon Helper Plugin
// Helps designers generate icon components with standardized variants and properties

figma.showUI(__html__, { width: 352, height: 557 });

let uiReady = false; 

/* ----------------------------- UI helpers ----------------------------- */

function sendSelectionState() {
  if (!uiReady) return;

  const sel = figma.currentPage.selection;
  const hasAnySelection = sel.length > 0;
  const hasFrame = sel.length === 1 && sel[0].type === 'FRAME';

  figma.ui.postMessage({
    type: 'selection-changed',
    hasAnySelection: hasAnySelection,
    hasSelection: hasFrame,
    isFrame: hasFrame,
    frameId: hasFrame ? sel[0].id : '',
    frameName: hasFrame ? sel[0].name : '',
    iconName: hasFrame ? toPascalCase(sel[0].name) : ''
  });
}

function toPascalCase(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

/* -------------------------- vector utilities -------------------------- */

function findVectorNodes(node) {
  const out = [];

  const isShape =
    node.type === 'VECTOR' ||
    node.type === 'RECTANGLE' ||
    node.type === 'ELLIPSE' ||
    node.type === 'LINE' ||
    node.type === 'STAR' ||
    node.type === 'POLYGON' ||
    node.type === 'BOOLEAN_OPERATION';

  if (isShape) out.push(node);

  if ('children' in node) {
    for (const c of node.children) {
      out.push.apply(out, findVectorNodes(c));
    }
  }

  return out;
}

function resetCornerRadius(node) {
  if ('cornerRadius' in node) node.cornerRadius = 0;
  if (
    'topLeftRadius' in node &&
    'topRightRadius' in node &&
    'bottomLeftRadius' in node &&
    'bottomRightRadius' in node
  ) {
    node.topLeftRadius = 0;
    node.topRightRadius = 0;
    node.bottomLeftRadius = 0;
    node.bottomRightRadius = 0;
  }
}

function canOutlineStroke(v) {
  return (
    v.type === 'VECTOR' &&
    Array.isArray(v.strokes) &&
    v.strokes.length > 0 &&
    typeof v.strokeWeight === 'number' &&
    v.strokeWeight > 0
  );
}

/* --------------------------- main generator --------------------------- */

async function generateIcon(iconName, description, family, rtl, convertStroke) {
  const sel = figma.currentPage.selection;

  if (sel.length !== 1 || sel[0].type !== 'FRAME') {
    figma.notify('Please select exactly one Frame');
    return;
  }

  if (!iconName || !iconName.trim()) {
    figma.notify('Please enter an icon name');
    return;
  }

  const frame = sel[0];
  const parent = frame.parent;

  const frameX = frame.x;
  const frameY = frame.y;
  const frameW = frame.width;
  const frameH = frame.height;

  const vectors = findVectorNodes(frame);
  if (!vectors.length) {
    figma.notify('No shapes found');
    return;
  }

  /* -------- temp workspace -------- */

  const temp = figma.createFrame();
  temp.name = '__icon-temp';
  parent.appendChild(temp);

  const clones = [];

  for (const v of vectors) {
    if (v.removed) continue;
    const c = v.clone();
    temp.appendChild(c);
    clones.push(c);
  }

  /* -------- STEP 1: outline strokes FIRST (UI behavior) -------- */

  if (convertStroke) {
    for (const v of clones) {
      if (canOutlineStroke(v)) {
        try {
          v.outlineStroke();
        } catch (e) {
          console.warn('outlineStroke failed:', e);
        }
      }
    }
  }

  /* -------- STEP 2: flatten everything into one vector -------- */

  let merged;

  try {
    merged =
      clones.length === 1 && clones[0].type === 'VECTOR'
        ? clones[0]
        : figma.flatten(clones, temp);
  } catch (e) {
    merged = clones[0];
  }

  if (!merged || merged.removed) {
    temp.remove();
    figma.notify('Flatten failed');
    return;
  }

  /* -------- STEP 3: UI-normalization flatten (mandatory) -------- */

  let finalVector = merged;
  try {
    finalVector = figma.flatten([merged], temp);
  } catch (e) {
    finalVector = merged;
  }

  if (!finalVector || finalVector.removed) {
    temp.remove();
    figma.notify('Final flatten failed');
    return;
  }

  /* -------- STEP 4: preserve geometry -------- */

  const bounds = finalVector.absoluteBoundingBox;
  if (!bounds) {
    temp.remove();
    figma.notify('Could not read bounds');
    return;
  }

  const vW = bounds.width;
  const vH = bounds.height;

  /* -------- STEP 5: component -------- */

  const component = figma.createComponent();
  component.resize(frameW, frameH);
  component.appendChild(finalVector);

  resetCornerRadius(finalVector);

  finalVector.resize(vW, vH);
  finalVector.x = (component.width - finalVector.width) / 2;
  finalVector.y = (component.height - finalVector.height) / 2;
  finalVector.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
  finalVector.name = 'Vector';

  temp.remove();

  component.x = frameX;
  component.y = frameY;

  /* -------- STEP 6: variants -------- */

  const set = figma.combineAsVariants([component], figma.currentPage);

  set.layoutMode = 'HORIZONTAL';
  set.layoutWrap = 'WRAP';
  set.itemSpacing = 8;
  set.counterAxisSpacing = 8;
  set.resize(frameW * 2 + 8, frameH * 2 + 8);

  resetCornerRadius(set);
  resetCornerRadius(component);

  set.name = iconName;
  component.name = 'RTL=' + rtl + ', Family=' + family;

  if (description) set.description = description;

  frame.remove();

  figma.currentPage.selection = [set];
  figma.viewport.scrollAndZoomIntoView([set]);

  figma.notify('Icon "' + iconName + '" generated');
}

/* ----------------------------- messaging ----------------------------- */

figma.ui.onmessage = async msg => {
  if (msg.type === 'ui-ready') {
    uiReady = true;
    sendSelectionState();
  }

  if (msg.type === 'resize-ui') {
    const width = 352;
    const minHeight = 220;
    const maxHeight = 1200;
    const requestedHeight = Number(msg.height);
    const safeHeight = Number.isFinite(requestedHeight)
      ? Math.max(minHeight, Math.min(maxHeight, Math.round(requestedHeight)))
      : minHeight;
    figma.ui.resize(width, safeHeight);
  }

  if (msg.type === 'generate-icon') {
    await generateIcon(
      msg.iconName,
      msg.description,
      msg.family,
      msg.rtl,
      msg.convertStroke
    );
    figma.closePlugin();
  }

  if (msg.type === 'cancel') figma.closePlugin();
};

figma.on('selectionchange', sendSelectionState);
