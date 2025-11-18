if (!customElements.get('bopis-location-selector')) {
  customElements.define('bopis-location-selector', class BopisLocationSelector extends HTMLElement {
    constructor() {
      super();
      this.state = {
        locations: [],
        selectedLocation: null,
        loading: false,
        error: null,
        cartId: null
      };

      this.attachShadow({ mode: 'open' });
    }

    async connectedCallback() {
      // Load React and ReactDOM from CDN if not already loaded
      await this.loadReact();

      // Initialize the component
      this.initialize();
    }

    async loadReact() {
      if (window.React && window.ReactDOM) {
        return;
      }

      return new Promise((resolve, reject) => {
        const reactScript = document.createElement('script');
        reactScript.src = 'https://unpkg.com/react@18/umd/react.production.min.js';
        reactScript.crossOrigin = 'anonymous';

        const reactDomScript = document.createElement('script');
        reactDomScript.src = 'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js';
        reactDomScript.crossOrigin = 'anonymous';

        reactScript.onload = () => {
          reactDomScript.onload = resolve;
          reactDomScript.onerror = reject;
          document.head.appendChild(reactDomScript);
        };

        reactScript.onerror = reject;
        document.head.appendChild(reactScript);
      });
    }

    async initialize() {
      const storefrontAccessToken = this.dataset.storefrontToken;
      const shopDomain = this.dataset.shopDomain;

      if (!storefrontAccessToken || !shopDomain) {
        this.state.error = 'Configuration error: Missing Storefront API credentials';
        console.error('BOPIS: Missing required attributes (data-storefront-token or data-shop-domain)');
        this.render();
        return;
      }

      this.storefrontClient = new StorefrontClient(storefrontAccessToken, shopDomain);

      // Show initial loading state
      this.state.loading = true;
      this.render();

      try {
        // Fetch cart ID first, then locations
        await this.fetchCartId();
        await this.fetchPickupLocations();
      } catch (error) {
        console.error('BOPIS initialization failed:', error);
        this.state.error = error.message || 'Failed to initialize pickup selector';
      } finally {
        this.state.loading = false;
        this.render();
      }
    }

    async fetchCartId() {
      // Check if we have a stored Storefront cart ID
      const storedCartId = localStorage.getItem('shopify_storefront_cart_id');

      if (storedCartId) {
        // Verify the cart still exists
        const isValid = await this.verifyCart(storedCartId);
        if (isValid) {
          this.state.cartId = storedCartId;
          console.log('Using existing Storefront cart:', storedCartId);
          return;
        } else {
          console.log('Stored cart ID is invalid, creating new cart');
          localStorage.removeItem('shopify_storefront_cart_id');
        }
      }

      // Create a new cart via Storefront API
      await this.createStorefrontCart();
    }

    async verifyCart(cartId) {
      try {
        const query = `
          query getCart($cartId: ID!) {
            cart(id: $cartId) {
              id
            }
          }
        `;

        const data = await this.storefrontClient.query(query, { cartId });
        return data.cart && data.cart.id;
      } catch (error) {
        return false;
      }
    }

    async createStorefrontCart() {
      try {
        // Get current Ajax cart items to transfer them
        const ajaxCartResponse = await fetch('/cart.js');
        const ajaxCart = await ajaxCartResponse.json();

        const mutation = `
          mutation cartCreate($input: CartInput!) {
            cartCreate(input: $input) {
              cart {
                id
                checkoutUrl
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        // Convert Ajax cart items to Storefront API format
        const lines = ajaxCart.items.map(item => ({
          merchandiseId: `gid://shopify/ProductVariant/${item.variant_id}`,
          quantity: item.quantity
        }));

        const variables = {
          input: {
            lines: lines.length > 0 ? lines : []
          }
        };

        const data = await this.storefrontClient.mutate(mutation, variables);

        if (data.cartCreate.userErrors.length > 0) {
          throw new Error(data.cartCreate.userErrors[0].message);
        }

        this.state.cartId = data.cartCreate.cart.id;

        // Store cart ID in localStorage for future use
        localStorage.setItem('shopify_storefront_cart_id', this.state.cartId);

        console.log('Created Storefront API cart:', this.state.cartId);
      } catch (error) {
        console.error('Failed to create Storefront cart:', error);
        throw error;
      }
    }

    async fetchPickupLocations() {
      try {
        this.state.loading = true;
        this.state.error = null;

        // Fetch locations using Shopify's Storefront API
        const query = `
          query {
            locations(first: 20) {
              edges {
                node {
                  id
                  name
                  address {
                    address1
                    address2
                    city
                    province
                    country
                    zip
                  }
                }
              }
            }
          }
        `;

        const data = await this.storefrontClient.query(query);

        if (data.locations && data.locations.edges) {
          this.state.locations = data.locations.edges.map(edge => edge.node);
        }
      } catch (error) {
        console.error('Failed to fetch pickup locations:', error);
        this.state.error = 'Failed to load pickup locations';
      } finally {
        this.state.loading = false;
      }
    }

    async selectLocation(location) {
      if (!this.state.cartId) {
        this.state.error = 'Cart not initialized';
        this.render();
        return;
      }

      this.state.loading = true;
      this.state.error = null;
      this.render();

      try {
        // Step 1: Get current product variant and quantity from the product form
        const productForm = document.querySelector('product-form form');
        const variantId = productForm?.querySelector('[name="id"]')?.value;
        const quantity = parseInt(productForm?.querySelector('[name="quantity"]')?.value || '1');

        if (!variantId) {
          throw new Error('No product selected');
        }

        // Step 2: Add product to Storefront cart (or update if cart already has items)
        await this.addProductToStorefrontCart(variantId, quantity);

        // Step 3: Set pickup location on the cart
        const pickupHandle = location.id.split('/').pop();

        const mutation = `
          mutation cartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
            cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
              cart {
                id
                checkoutUrl
                buyerIdentity {
                  email
                  phone
                  countryCode
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
        `;

        const variables = {
          cartId: this.state.cartId,
          buyerIdentity: {
            preferences: {
              delivery: {
                deliveryMethod: 'PICK_UP',
                pickupHandle: pickupHandle
              }
            }
          }
        };

        const data = await this.storefrontClient.mutate(mutation, variables);

        if (data.cartBuyerIdentityUpdate.userErrors.length > 0) {
          throw new Error(data.cartBuyerIdentityUpdate.userErrors[0].message);
        }

        this.state.selectedLocation = location;
        const checkoutUrl = data.cartBuyerIdentityUpdate.cart.checkoutUrl;

        // Step 4: Show success and redirect to checkout with BOPIS settings
        this.showSuccessMessage(location, checkoutUrl);

        // Publish event for other components to react to
        if (typeof publish !== 'undefined') {
          publish(PUB_SUB_EVENTS.cartUpdate, {
            source: 'bopis-location-selector',
            cartId: this.state.cartId,
            pickupLocation: location
          });
        }
      } catch (error) {
        console.error('Failed to update pickup location:', error);
        this.state.error = error.message || 'Failed to set pickup location';
      } finally {
        this.state.loading = false;
        this.render();
      }
    }

    async addProductToStorefrontCart(variantId, quantity) {
      try {
        // First, check if product is already in cart
        const getCartQuery = `
          query getCart($cartId: ID!) {
            cart(id: $cartId) {
              id
              lines(first: 50) {
                edges {
                  node {
                    id
                    quantity
                    merchandise {
                      ... on ProductVariant {
                        id
                      }
                    }
                  }
                }
              }
            }
          }
        `;

        const cartData = await this.storefrontClient.query(getCartQuery, { cartId: this.state.cartId });
        const existingLines = cartData.cart?.lines?.edges || [];

        // Check if this variant is already in the cart
        const existingLine = existingLines.find(edge =>
          edge.node.merchandise.id === `gid://shopify/ProductVariant/${variantId}`
        );

        if (existingLine) {
          // Update quantity of existing line
          const updateMutation = `
            mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
              cartLinesUpdate(cartId: $cartId, lines: $lines) {
                cart {
                  id
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;

          const updateVariables = {
            cartId: this.state.cartId,
            lines: [{
              id: existingLine.node.id,
              quantity: existingLine.node.quantity + quantity
            }]
          };

          const updateData = await this.storefrontClient.mutate(updateMutation, updateVariables);

          if (updateData.cartLinesUpdate.userErrors.length > 0) {
            throw new Error(updateData.cartLinesUpdate.userErrors[0].message);
          }

          console.log('Updated product quantity in Storefront cart');
        } else {
          // Add new line to cart
          const addMutation = `
            mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
              cartLinesAdd(cartId: $cartId, lines: $lines) {
                cart {
                  id
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;

          const addVariables = {
            cartId: this.state.cartId,
            lines: [{
              merchandiseId: `gid://shopify/ProductVariant/${variantId}`,
              quantity: quantity
            }]
          };

          const addData = await this.storefrontClient.mutate(addMutation, addVariables);

          if (addData.cartLinesAdd.userErrors.length > 0) {
            throw new Error(addData.cartLinesAdd.userErrors[0].message);
          }

          console.log('Added product to Storefront cart');
        }
      } catch (error) {
        console.error('Failed to add product to cart:', error);
        throw error;
      }
    }

    showSuccessMessage(location, checkoutUrl) {
      // Show a custom success message with checkout button
      const successDiv = document.createElement('div');
      successDiv.className = 'bopis-success-overlay';
      successDiv.innerHTML = `
        <div class="bopis-success-modal">
          <div class="bopis-success-content">
            <svg class="bopis-success-icon" viewBox="0 0 24 24" width="48" height="48">
              <circle cx="12" cy="12" r="12" fill="#4CAF50"/>
              <path d="M9 12l2 2 4-4" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/>
            </svg>
            <h3>Ready for Pickup!</h3>
            <p>Product added to cart with pickup at:</p>
            <p class="bopis-location-name"><strong>${location.name}</strong></p>
            <p class="bopis-location-address">${location.address.address1}<br>${location.address.city}, ${location.address.province} ${location.address.zip}</p>
            <div class="bopis-success-actions">
              <a href="${checkoutUrl}" class="bopis-checkout-button">Proceed to Checkout</a>
              <button class="bopis-continue-button" onclick="this.closest('.bopis-success-overlay').remove()">Continue Shopping</button>
            </div>
          </div>
        </div>
      `;

      // Add styles for the modal
      const style = document.createElement('style');
      style.textContent = `
        .bopis-success-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          animation: fadeIn 0.2s ease-in;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .bopis-success-modal {
          background: white;
          border-radius: 12px;
          padding: 32px;
          max-width: 500px;
          margin: 20px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .bopis-success-content {
          text-align: center;
        }

        .bopis-success-icon {
          margin-bottom: 16px;
        }

        .bopis-success-content h3 {
          margin: 0 0 12px;
          font-size: 24px;
          color: #333;
        }

        .bopis-success-content p {
          margin: 8px 0;
          color: #666;
          line-height: 1.5;
        }

        .bopis-location-name {
          font-size: 18px;
          color: #333;
          margin: 16px 0 8px;
        }

        .bopis-location-address {
          font-size: 14px;
          color: #666;
          margin-bottom: 24px;
        }

        .bopis-success-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 24px;
        }

        .bopis-checkout-button {
          display: inline-block;
          padding: 14px 28px;
          background: #2c6ecb;
          color: white;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          font-size: 16px;
          transition: background 0.2s;
        }

        .bopis-checkout-button:hover {
          background: #1e5ab5;
        }

        .bopis-continue-button {
          padding: 12px 28px;
          background: transparent;
          color: #666;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .bopis-continue-button:hover {
          background: #f5f5f5;
          border-color: #999;
        }
      `;

      document.head.appendChild(style);
      document.body.appendChild(successDiv);

      // Auto-remove after 30 seconds if user doesn't interact
      setTimeout(() => {
        if (successDiv.parentNode) {
          successDiv.remove();
        }
      }, 30000);
    }

    render() {
      const React = window.React;
      const ReactDOM = window.ReactDOM;

      if (!React || !ReactDOM) {
        console.error('React not loaded');
        return;
      }

      const { createElement: h } = React;

      // Create container for styles
      const styleSheet = document.createElement('style');
      styleSheet.textContent = this.getStyles();

      // Clear shadow root
      this.shadowRoot.innerHTML = '';
      this.shadowRoot.appendChild(styleSheet);

      // Create container for React app
      const container = document.createElement('div');
      this.shadowRoot.appendChild(container);

      // React Component
      const BopisLocationSelectorUI = () => {
        const { locations, selectedLocation, loading, error } = this.state;

        return h('div', { className: 'bopis-container' },
          h('h3', { className: 'bopis-title' }, 'Select Pickup Location'),

          error && h('div', { className: 'bopis-error' },
            h('svg', {
              className: 'icon-error',
              viewBox: '0 0 13 13',
              width: '13',
              height: '13'
            },
              h('circle', { cx: '6.5', cy: '6.5', r: '5.5', fill: '#EB001B' })
            ),
            h('span', null, error)
          ),

          loading ? h('div', { className: 'bopis-loading' },
            h('div', { className: 'spinner' }),
            h('span', null, 'Loading...')
          ) : (
            locations.length === 0 ?
              h('p', { className: 'bopis-no-locations' },
                'No pickup locations available'
              ) :
              h('div', { className: 'bopis-locations' },
                locations.map((location) =>
                  h('div', {
                    key: location.id,
                    className: `bopis-location ${selectedLocation?.id === location.id ? 'selected' : ''}`,
                    onClick: () => this.selectLocation(location)
                  },
                    h('div', { className: 'bopis-location-content' },
                      h('div', { className: 'bopis-location-header' },
                        h('strong', { className: 'bopis-location-name' }, location.name),
                        selectedLocation?.id === location.id &&
                          h('span', { className: 'bopis-selected-badge' }, '✓ Selected')
                      ),
                      h('div', { className: 'bopis-location-address' },
                        h('div', null, location.address.address1),
                        location.address.address2 && h('div', null, location.address.address2),
                        h('div', null,
                          `${location.address.city}, ${location.address.province} ${location.address.zip}`
                        ),
                        h('div', null, location.address.country)
                      )
                    )
                  )
                )
              )
          )
        );
      };

      // Render React component
      const root = ReactDOM.createRoot(container);
      root.render(h(BopisLocationSelectorUI));
    }

    getStyles() {
      return `
        .bopis-container {
          margin: 20px 0;
          padding: 20px;
          border: 1px solid #e5e5e5;
          border-radius: 8px;
          background: #fff;
        }

        .bopis-title {
          margin: 0 0 16px;
          font-size: 18px;
          font-weight: 600;
          color: #333;
        }

        .bopis-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: #fee;
          border: 1px solid #fcc;
          border-radius: 4px;
          color: #c00;
          margin-bottom: 16px;
        }

        .bopis-loading {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 20px;
          justify-content: center;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid #f3f3f3;
          border-top: 2px solid #333;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .bopis-no-locations {
          text-align: center;
          color: #666;
          padding: 20px;
        }

        .bopis-locations {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .bopis-location {
          padding: 16px;
          border: 2px solid #e5e5e5;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .bopis-location:hover {
          border-color: #333;
          background: #fafafa;
        }

        .bopis-location.selected {
          border-color: #2c6ecb;
          background: #f0f7ff;
        }

        .bopis-location-content {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .bopis-location-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .bopis-location-name {
          font-size: 16px;
          color: #333;
        }

        .bopis-selected-badge {
          display: inline-block;
          padding: 4px 8px;
          background: #2c6ecb;
          color: white;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
        }

        .bopis-location-address {
          font-size: 14px;
          color: #666;
          line-height: 1.5;
        }
      `;
    }
  });
}

// Storefront API Client
class StorefrontClient {
  constructor(accessToken, shopDomain) {
    this.accessToken = accessToken;
    this.endpoint = `https://${shopDomain}/api/2024-01/graphql.json`;
  }

  async query(query, variables = {}) {
    return this.request(query, variables);
  }

  async mutate(mutation, variables = {}) {
    return this.request(mutation, variables);
  }

  async request(query, variables) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': this.accessToken
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      throw new Error(`Storefront API error: ${response.statusText}`);
    }

    const { data, errors } = await response.json();

    if (errors) {
      throw new Error(errors[0].message);
    }

    return data;
  }
}
