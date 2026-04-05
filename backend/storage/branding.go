package storage

import "b8n6mail/models"

const brandingFile = "branding.json"

// ReadBranding returns saved branding, falling back to defaults.
func ReadBranding() (*models.Branding, error) {
	b := models.DefaultBranding()
	if err := ReadJSON(FilePath(brandingFile), &b); err != nil {
		// File doesn't exist — return defaults, don't error.
		return &b, nil
	}
	// Backfill any blank fields with defaults so older saved files still work.
	d := models.DefaultBranding()
	if b.AppName == "" {
		b.AppName = d.AppName
	}
	if b.ColorPrimary == "" {
		b.ColorPrimary = d.ColorPrimary
	}
	if b.ColorPrimaryDim == "" {
		b.ColorPrimaryDim = d.ColorPrimaryDim
	}
	if b.ColorBackground == "" {
		b.ColorBackground = d.ColorBackground
	}
	if b.ColorText == "" {
		b.ColorText = d.ColorText
	}
	if b.ColorAccent == "" {
		b.ColorAccent = d.ColorAccent
	}
	if b.ColorPrimaryLight == "" {
		b.ColorPrimaryLight = d.ColorPrimaryLight
	}
	if b.ColorPrimaryDimLight == "" {
		b.ColorPrimaryDimLight = d.ColorPrimaryDimLight
	}
	if b.ColorBackgroundLight == "" {
		b.ColorBackgroundLight = d.ColorBackgroundLight
	}
	if b.ColorTextLight == "" {
		b.ColorTextLight = d.ColorTextLight
	}
	if b.ColorAccentLight == "" {
		b.ColorAccentLight = d.ColorAccentLight
	}
	if b.TickerTopLabel == "" {
		b.TickerTopLabel = d.TickerTopLabel
	}
	if b.TickerBottomLabel == "" {
		b.TickerBottomLabel = d.TickerBottomLabel
	}
	return &b, nil
}

// WriteBranding persists branding config.
func WriteBranding(b *models.Branding) error {
	return WriteJSON(FilePath(brandingFile), b)
}
