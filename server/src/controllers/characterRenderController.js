const { renderPreset, renderDress } = require('../services/characterRenderService');

/**
 * POST /api/character/render
 *
 * Body (preset mode):
 *   { mode: 'preset', presetId, bodyPoseId }
 *
 * Body (dress mode):
 *   { mode: 'dress', layoutPath, overrides: { cloth, neck, hands } }
 *
 * Response:
 *   { url, outputW, outputH, faceOverlay, faceId? }
 *
 * `url` is a static /uploads/renders/xxx.webp path served by Express.
 * The flat WebP contains ONLY structural layers — individual asset PNGs never leave the
 * server. Skin/hair/eye colour and expression overlays are applied by the client.
 */
const renderCharacter = async (req, res) => {
  try {
    const { mode, presetId, bodyPoseId, skinTone, layoutPath, overrides } = req.body;

    if (mode === 'preset') {
      if (!presetId || !bodyPoseId) return res.status(400).json({ error: 'presetId and bodyPoseId required' });
      const result = await renderPreset({ presetId, bodyPoseId, skinTone });
      return res.json(result);
    }

    if (mode === 'dress') {
      if (!layoutPath) return res.status(400).json({ error: 'layoutPath required' });
      const result = await renderDress({ layoutPath, overrides, skinTone });
      return res.json(result);
    }

    return res.status(400).json({ error: 'mode must be "preset" or "dress"' });
  } catch (err) {
    console.error('[character-render]', err.message);
    res.status(500).json({ error: err.message || 'Render failed' });
  }
};

module.exports = { renderCharacter };
