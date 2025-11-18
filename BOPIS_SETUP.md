# BOPIS (Buy Online, Pick Up In Store) Setup Guide

This guide explains how to set up and use the BOPIS Location Selector component in your Shopify theme.

## Overview

The BOPIS Location Selector is a React-based component that allows customers to select a pickup location for their entire cart directly from the product detail page. It uses Shopify's Storefront API to update cart buyer preferences with the selected pickup location.

## Features

- **Cart-level pickup selection**: Sets pickup preferences for the entire cart, not individual items
- **React UI**: Modern, accessible interface built with React
- **Storefront API integration**: Uses `cartBuyerIdentityUpdate` mutation
- **Shadow DOM**: Component styles are scoped and won't conflict with theme styles
- **Web Component wrapper**: Integrates seamlessly with Liquid theme architecture

## Prerequisites

Before using this feature, you need:

1. **Storefront API Access Token**
   - Go to Shopify Admin > Settings > Apps and sales channels > Develop apps
   - Create a new app or use an existing one
   - Enable Storefront API access
   - Grant the following permissions:
     - `unauthenticated_read_product_listings`
     - `unauthenticated_write_checkouts`
     - `unauthenticated_read_checkouts`
   - Copy the Storefront API access token

2. **Pickup Locations Configured**
   - Go to Shopify Admin > Settings > Locations
   - Enable "Local pickup" for locations where customers can pick up orders
   - Ensure locations have proper addresses configured

3. **Cart Created via Storefront API** (Recommended)
   - For full compatibility, create the cart using the Storefront API
   - This ensures the cart ID format is compatible with `cartBuyerIdentityUpdate`
   - See "Cart Integration" section below for details

## Installation Steps

### Step 1: Add Storefront API Token to Theme Settings

You need to add your Storefront API token to the theme settings. You have two options:

#### Option A: Add to settings_schema.json (Recommended)

Add this to `config/settings_schema.json`:

```json
{
  "name": "Storefront API",
  "settings": [
    {
      "type": "text",
      "id": "storefront_api_token",
      "label": "Storefront API Access Token",
      "info": "Enter your Storefront API access token from Shopify Admin > Apps"
    }
  ]
}
```

Then configure the token in:
- Shopify Admin > Online Store > Themes > Customize > Theme Settings > Storefront API

#### Option B: Hardcode in Snippet (Testing Only)

For testing purposes, you can temporarily hardcode the token in `snippets/bopis-location-selector.liquid`:

```liquid
{%- assign storefront_token = "your-storefront-api-token-here" -%}
```

**⚠️ Warning:** Never commit hardcoded tokens to version control!

### Step 2: Add BOPIS Block to Product Page

The BOPIS Location Selector block is now available in the theme editor:

1. Go to Shopify Admin > Online Store > Themes > Customize
2. Navigate to a product page
3. In the product section, click "Add block"
4. Select "BOPIS Location Selector"
5. Position it where you want (typically after "Buy buttons")
6. Save your changes

## How It Works

### Component Flow

1. **Initialization**
   - Component loads React from CDN on first render
   - Fetches current cart ID from Shopify Ajax Cart API
   - Queries available pickup locations via Storefront API

2. **Location Selection**
   - Customer clicks on a pickup location
   - Component calls Storefront API `cartBuyerIdentityUpdate` mutation
   - Updates cart with:
     - `deliveryMethod: PICK_UP`
     - `pickupHandle: {location-id}`

3. **Cart Update**
   - Publishes cart update event via PubSub
   - Other cart components can react to the change
   - Success message displayed to customer

### Storefront API Mutation

The component uses this mutation structure:

```graphql
mutation cartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
  cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
    cart {
      id
      buyerIdentity {
        preferences {
          delivery {
            deliveryMethod
            pickupHandle
          }
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

## Cart Integration

### Current Implementation

The component currently converts the Ajax Cart token to a Storefront API cart ID format. This is a simplified conversion and may need adjustment based on your specific setup.

### Recommended Approach

For production use, consider implementing full Storefront API cart management:

1. **Create cart via Storefront API**:
```graphql
mutation cartCreate {
  cartCreate {
    cart {
      id
      checkoutUrl
    }
  }
}
```

2. **Store cart ID** in session or local storage

3. **Use cart ID** with all Storefront API operations

4. **Sync with Ajax Cart** if needed for compatibility with existing features

### Hybrid Approach

If you need to maintain compatibility with existing Ajax Cart functionality:

1. Create cart via Storefront API
2. Store both cart IDs (Storefront and Ajax)
3. Use Storefront API for buyer identity updates
4. Use Ajax Cart API for line item operations
5. Keep both carts synchronized

## Customization

### Styling

The component uses Shadow DOM with inline styles. To customize styles, edit the `getStyles()` method in `assets/bopis-location-selector.js`:

```javascript
getStyles() {
  return `
    .bopis-container {
      /* Your custom styles */
    }
    /* ... more styles ... */
  `;
}
```

### Location Display

To modify how locations are displayed, edit the React component in the `render()` method of `assets/bopis-location-selector.js`.

### Adding Location Features

You can extend the location data fetched from the API. Modify the GraphQL query in `fetchPickupLocations()`:

```javascript
const query = `
  query {
    locations(first: 20) {
      edges {
        node {
          id
          name
          address { ... }
          # Add more fields:
          # phone
          # email
          # hours
        }
      }
    }
  }
`;
```

## Testing

### Manual Testing Checklist

1. **Component Loads**
   - [ ] Component appears on product page
   - [ ] React loads from CDN
   - [ ] No console errors

2. **Locations Display**
   - [ ] Pickup locations are fetched and displayed
   - [ ] Location details (name, address) are correct
   - [ ] Multiple locations are shown (if available)

3. **Location Selection**
   - [ ] Clicking a location highlights it
   - [ ] Selected badge appears
   - [ ] Loading state shows during API call
   - [ ] Success message appears after selection

4. **Cart Integration**
   - [ ] Cart ID is retrieved correctly
   - [ ] Storefront API mutation succeeds
   - [ ] Cart preferences are updated
   - [ ] Selection persists through page navigation

5. **Error Handling**
   - [ ] Error shown if API token missing
   - [ ] Error shown if API call fails
   - [ ] Error shown if no locations available
   - [ ] Fallback content shows if JavaScript disabled

### Testing with Browser DevTools

1. **Check Network Requests**:
   - Open DevTools > Network tab
   - Look for requests to `/api/2024-01/graphql.json`
   - Verify request/response format

2. **Check Console**:
   - Look for any errors or warnings
   - BOPIS component logs key events

3. **Inspect Cart State**:
   ```javascript
   // In browser console
   fetch('/cart.js')
     .then(r => r.json())
     .then(cart => console.log('Cart:', cart));
   ```

## Troubleshooting

### "Failed to load pickup locations"

**Causes**:
- Invalid or missing Storefront API token
- Insufficient API permissions
- No pickup locations configured in Shopify Admin

**Solutions**:
1. Verify API token in theme settings
2. Check API permissions include location access
3. Ensure locations have "Local pickup" enabled

### "Failed to set pickup location"

**Causes**:
- Cart ID format incompatible with Storefront API
- Cart doesn't exist in Storefront API
- Invalid location ID

**Solutions**:
1. Implement Storefront API cart creation
2. Verify cart ID format matches Storefront API expectations
3. Check location ID is valid

### Component doesn't appear

**Causes**:
- Block not added to product page
- JavaScript errors preventing load
- Storefront token not configured

**Solutions**:
1. Add block in theme editor
2. Check browser console for errors
3. Verify token configuration

### Styling conflicts

**Causes**:
- Shadow DOM not working in older browsers
- Custom theme CSS affecting component

**Solutions**:
1. Test in modern browsers (Chrome, Firefox, Safari, Edge)
2. Check Shadow DOM support
3. Adjust component styles if needed

## Browser Support

- **Modern browsers**: Full support (Chrome, Firefox, Safari, Edge)
- **Internet Explorer**: Not supported (requires polyfills for Web Components and Shadow DOM)

## Security Considerations

1. **API Token**: Store securely in theme settings, never in Git
2. **Cart ID**: Validate cart ownership before updates
3. **Location IDs**: Validate location exists and accepts pickup
4. **XSS Protection**: React escapes content by default

## Performance

- **React loaded from CDN**: Cached across sessions
- **Shadow DOM**: Styles scoped, no impact on theme
- **Lazy loading**: Component only loads on product pages
- **API calls**: Cached where possible

## Future Enhancements

Potential improvements:

1. **Location Search**: Add search/filter for multiple locations
2. **Map Integration**: Show locations on a map
3. **Availability Check**: Show real-time inventory at each location
4. **Store Hours**: Display pickup hours and current status
5. **Distance Calculation**: Show distance from customer's location
6. **Multi-language**: Add translation support

## Files Created

- `assets/bopis-location-selector.js` - Main component with React and Storefront API client
- `snippets/bopis-location-selector.liquid` - Liquid snippet to render component
- `sections/main-product.liquid` - Updated with bopis_location_selector block
- `BOPIS_SETUP.md` - This documentation file

## API Reference

### Storefront API Endpoints Used

1. **Locations Query**: Fetches available pickup locations
2. **cartBuyerIdentityUpdate Mutation**: Updates cart with pickup preferences

### Component Props (Data Attributes)

- `data-storefront-token`: Storefront API access token (required)
- `data-shop-domain`: Shop domain, e.g., "mystore.myshopify.com" (required)
- `data-section-id`: Section ID for context (optional)
- `data-cart-id`: Pre-existing Storefront cart ID (optional)

## Support

For issues or questions:

1. Check browser console for errors
2. Verify API token and permissions
3. Ensure pickup locations are configured
4. Review Shopify's [Storefront API documentation](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage)

## References

- [Shopify Storefront API - Cart Management](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage)
- [Shopify Local Pickup](https://help.shopify.com/en/manual/shipping/setting-up-and-managing-your-shipping/local-methods/local-pickup)
- [React Documentation](https://react.dev/)
- [Web Components](https://developer.mozilla.org/en-US/docs/Web/Web_Components)
