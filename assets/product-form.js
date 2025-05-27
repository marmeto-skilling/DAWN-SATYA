if (!customElements.get('product-form')) {
  customElements.define(
    'product-form',
    class ProductForm extends HTMLElement {
      constructor() {
        super();

        this.form = this.querySelector('form');
        this.variantIdInput.disabled = false;
        this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
        this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        this.submitButton = this.querySelector('[type="submit"]');
        this.submitButtonText = this.submitButton.querySelector('span');

        if (document.querySelector('cart-drawer')) this.submitButton.setAttribute('aria-haspopup', 'dialog');

        this.hideErrors = this.dataset.hideErrors === 'true';
      }

      async fetchChildProductVariants(quantity) {
        const childDataElement = document.getElementById('child-products-data');
        if (!childDataElement) return [];

        const childProducts = JSON.parse(childDataElement.textContent);
        const variantItems = [];

        for (const child of childProducts) {
          const res = await fetch(`/products/${child.handle}.js`);
          const data = await res.json();

          variantItems.push({
            id: data.variants[0].id,
            quantity: quantity,
            properties: {
              _bundle_child: 'true',
            },
          });
        }
        return variantItems;
      }

      onSubmitHandler(evt) {
        evt.preventDefault();
        if (this.submitButton.getAttribute('aria-disabled') === 'true') return;

        this.handleErrorMessage();

        this.submitButton.setAttribute('aria-disabled', true);
        this.submitButton.classList.add('loading');
        this.querySelector('.loading__spinner').classList.remove('hidden');

        const formData = new FormData(this.form);
        const parentId = formData.get('id');
        const quantity = parseInt(formData.get('quantity')) || 1;

        this.fetchChildProductVariants(quantity).then((childItems) => {
          const addFormData = new FormData();

          // Append parent item
          addFormData.append('items[0][id]', parentId);
          addFormData.append('items[0][quantity]', quantity);

          // Append child items
          childItems.forEach((child, index) => {
            const childIndex = index + 1;
            addFormData.append(`items[${childIndex}][id]`, child.id);
            addFormData.append(`items[${childIndex}][quantity]`, child.quantity);
            addFormData.append(`items[${childIndex}][properties][_bundle_child]`, 'true');
          });

          // Append cart sections if applicable
          if (this.cart) {
            addFormData.append(
              'sections',
              this.cart.getSectionsToRender().map((section) => section.id)
            );
            addFormData.append('sections_url', window.location.pathname);
            this.cart.setActiveElement(document.activeElement);
          }

          const config = {
            method: 'POST',
            body: addFormData,
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
            },
          };

          fetch('/cart/add', config)
            .then((response) => response.text())
            .then(() => {
              if (!this.cart) {
                window.location = window.routes.cart_url;
                return;
              }

              fetch(`${routes.cart_url}.js`)
                .then((res) => res.json())
                .then((cartData) => {
                  publish(PUB_SUB_EVENTS.cartUpdate, {
                    source: 'product-form',
                    productVariantId: parentId,
                    cartData: cartData,
                  });
                  this.cart.renderContents(cartData);
                });
            })
            .catch((e) => {
              console.error('Add to cart failed', e);
            })
            .finally(() => {
              this.submitButton.classList.remove('loading');
              if (this.cart && this.cart.classList.contains('is-empty'))
                this.cart.classList.remove('is-empty');
              if (!this.error) this.submitButton.removeAttribute('aria-disabled');
              this.querySelector('.loading__spinner').classList.add('hidden');

              CartPerformance.measureFromEvent('add:user-action', evt);
            });
        });
      }

      handleErrorMessage(errorMessage = false) {
        if (this.hideErrors) return;

        this.errorMessageWrapper =
          this.errorMessageWrapper || this.querySelector('.product-form__error-message-wrapper');
        if (!this.errorMessageWrapper) return;
        this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.product-form__error-message');

        this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);

        if (errorMessage) {
          this.errorMessage.textContent = errorMessage;
        }
      }

      toggleSubmitButton(disable = true, text) {
        if (disable) {
          this.submitButton.setAttribute('disabled', 'disabled');
          if (text) this.submitButtonText.textContent = text;
        } else {
          this.submitButton.removeAttribute('disabled');
          this.submitButtonText.textContent = window.variantStrings.addToCart;
        }
      }

      get variantIdInput() {
        return this.form.querySelector('[name=id]');
      }
    }
  );
}
