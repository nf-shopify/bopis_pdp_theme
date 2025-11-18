# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Shopify Theme** based on the "Generated Data Theme" template. It's a standard Shopify 2.0 theme using Liquid templating, vanilla JavaScript with Web Components, and modular CSS architecture.

## Theme Architecture

### Directory Structure

- **`layout/`**: Base theme layouts (theme.liquid, password.liquid)
- **`templates/`**: Page-level JSON templates that define section structure (product.json, collection.json, etc.)
- **`sections/`**: Reusable sections with Liquid + schema (main-product.liquid, featured-collection.liquid, etc.)
- **`snippets/`**: Reusable Liquid components (buy-buttons.liquid, product-thumbnail.liquid, icon-*.liquid)
- **`assets/`**: Static files (CSS, JavaScript, images)
- **`config/`**: Theme configuration (settings_schema.json, settings_data.json)
- **`locales/`**: Translation files for internationalization

### Theme Settings System

Theme configuration is managed through `config/settings_schema.json`:
- Global settings accessible via `{{ settings.setting_name }}`
- CSS variables are generated dynamically in `layout/theme.liquid` from settings (colors, typography, spacing, borders, shadows)
- Settings include: colors/gradients, typography, layout, buttons, cards, badges, media, cart behavior

### Section Schema Pattern

Sections (in `sections/`) follow this structure:
1. CSS imports at top
2. Inline `<style>` block for dynamic section-specific CSS (padding from section.settings)
3. JavaScript imports with defer
4. HTML markup using Liquid
5. Schema definition at bottom (settings, blocks, presets)

Example: `sections/main-product.liquid` defines the product page template with configurable blocks.

### Template JSON Structure

Templates (in `templates/`) are JSON files that:
- Define which sections appear on a page
- Configure section settings
- Set block order within sections
- Example: `templates/product.json` includes "main" (main-product section) and "related-products"

## JavaScript Architecture

### Web Components Pattern

The theme uses native Web Components (Custom Elements) for interactive functionality:
- Components defined with `customElements.define('element-name', class extends HTMLElement)`
- Examples: `product-form`, `cart-drawer`, `cart-notification`, `details-modal`
- Located in individual JS files in `assets/`

Key components:
- **`product-form.js`**: Handles add-to-cart form submission, variant changes
- **`cart-drawer.js`**: Side drawer cart interface
- **`cart-notification.js`**: Toast-style cart notifications
- **`product-info.js`**: Product page info wrapper and updates

### Core JavaScript Files

- **`global.js`**: Focus management utilities, keyboard navigation, escape handlers
- **`constants.js`**: Global constants and configuration
- **`pubsub.js`**: Event publish/subscribe system for component communication
- **`cart.js`**: Cart functionality and AJAX operations

### State Management

- Uses PubSub pattern (in `pubsub.js`) for inter-component communication
- Cart state managed via Shopify Cart API (AJAX calls)
- Window globals for routes and translations defined in `layout/theme.liquid`

## Liquid Templating Patterns

### Render Snippets

Snippets are included with `{% render 'snippet-name', param: value %}`
- Common: `buy-buttons`, `card-product`, `product-thumbnail`, `price`
- Icons: `icon-*` snippets for SVG icons

### Product Object

Access product data in sections/templates:
- `product.title`, `product.price`, `product.vendor`
- `product.media` for images/videos
- `product.variants` for product variants
- `product.metafields` for custom data

### Settings Access

- Global: `{{ settings.colors_accent_1 }}`
- Section: `{{ section.settings.padding_top }}`
- Block: `{{ block.settings.text }}`

## Styling System

### CSS Architecture

- **`base.css`**: Core styles, typography, layout utilities
- **Component CSS**: Prefixed with `component-*.css` (component-card.css, component-cart.css)
- **Section CSS**: Prefixed with `section-*.css` for section-specific styles
- Modular approach: Each component/section loads its own CSS

### CSS Variables

CSS custom properties defined in `layout/theme.liquid`:
- Colors: `--color-base-text`, `--color-base-accent-1`, etc.
- Typography: `--font-body-family`, `--font-heading-family`, `--font-body-scale`
- Spacing: `--spacing-sections-desktop`, `--grid-desktop-vertical-spacing`
- Component styles: `--buttons-radius`, `--product-card-shadow-opacity`

## Common Development Patterns

### Adding a New Section

1. Create `.liquid` file in `sections/`
2. Include CSS/JS imports at top
3. Add schema JSON at bottom with settings/blocks
4. Use `{{ section.id }}` for unique IDs
5. Access settings via `{{ section.settings.setting_name }}`

### Creating a Snippet

1. Create `.liquid` file in `snippets/`
2. Define parameters that can be passed in
3. Render with `{% render 'snippet-name', param: value %}`

### Adding JavaScript Functionality

1. Create `.js` file in `assets/`
2. Define Web Component or utility functions
3. Import in section/layout with `<script src="{{ 'filename.js' | asset_url }}" defer="defer"></script>`
4. Use PubSub for cross-component communication

### Working with Icons

- Icon snippets in `snippets/icon-*.liquid` contain inline SVG
- Include with `{% render 'icon-name' %}`
- Common icons: arrow, cart, close, checkmark, error, success

## Shopify-Specific Features

### Cart Functionality

- Three cart types: drawer, page, notification (configured in settings)
- Cart type setting: `{{ settings.cart_type }}`
- AJAX cart operations use Shopify Cart API routes
- Cart drawer rendered conditionally in `layout/theme.liquid`

### Variant Selection

- Handled by `variant_picker` block type in product sections
- JavaScript in `product-form.js` manages variant changes
- Variant data accessed via `product.variants`

### Section Groups

- `header-group.json` and `footer-group.json` define repeatable section groups
- Rendered with `{% sections 'header-group' %}`

### Metafields

- Access custom data with `product.metafields.namespace.key`
- Can be used in Liquid templates for custom product information

## Localization

- Translation files in `locales/` (JSON format)
- Access translations: `{{ 'sections.cart.title' | t }}`
- Settings schema uses translation keys: `"label": "t:settings_schema.colors.name"`

## Development Notes

### Shopify CLI

This theme is typically developed using Shopify CLI:
- `shopify theme dev` - Start development server with hot reload
- `shopify theme push` - Deploy theme to store
- `shopify theme pull` - Pull theme from store

### Design Mode

- `Shopify.designMode` available in JavaScript when editing in theme editor
- Use for editor-specific functionality: `if (Shopify.designMode) { ... }`

### Performance Considerations

- CSS/JS loaded with `defer` attribute
- Predictive search CSS loaded with print media + onload swap
- Fonts preloaded for performance
- Images use Shopify CDN with dynamic sizing: `{{ image | image_url: width: 300 }}`

## BOPIS (Buy Online, Pick Up In Store) Feature

### Overview

A React-based component for cart-level pickup location selection, integrated as a Web Component.

### Files

- **`assets/bopis-location-selector.js`**: React component with Storefront API integration
- **`snippets/bopis-location-selector.liquid`**: Liquid snippet to render the component
- **`BOPIS_SETUP.md`**: Comprehensive setup and usage documentation

### Integration

- Available as a block type in `sections/main-product.liquid`
- Uses Shopify Storefront API `cartBuyerIdentityUpdate` mutation
- Loads React from CDN, wrapped in Web Component
- Shadow DOM for style isolation

### Key Technical Details

- **Storefront API**: Requires access token configured in theme settings
- **Cart Integration**: Converts Ajax Cart token to Storefront cart ID format
- **Mutation**: Sets `deliveryMethod: PICK_UP` and `pickupHandle` for entire cart
- **PubSub**: Publishes cart update events for other components

### Setup Requirements

1. Storefront API access token (configure in settings or snippet)
2. Pickup locations enabled in Shopify Admin
3. Add block to product page via theme editor

See `BOPIS_SETUP.md` for detailed setup instructions, testing guide, and troubleshooting.

## Key Files to Know

- **`layout/theme.liquid`**: Main layout wrapper, defines document structure, loads global CSS/JS, sets up CSS variables
- **`sections/main-product.liquid`**: Product page template (PDP), includes BOPIS block
- **`sections/header.liquid`**: Site header/navigation
- **`sections/footer.liquid`**: Site footer
- **`snippets/buy-buttons.liquid`**: Add to cart button component
- **`snippets/bopis-location-selector.liquid`**: BOPIS location selector component
- **`assets/product-form.js`**: Product form submission and variant handling
- **`assets/bopis-location-selector.js`**: BOPIS React component with Storefront API client
- **`config/settings_schema.json`**: Theme customization options in admin
