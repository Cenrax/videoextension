/**
 * Service for DOM manipulation (body wrapping for sidebar).
 */

export class DomService {
  private static readonly WRAPPER_ID = "plasmo-content-wrapper";
  private static readonly SIDEBAR_CONTAINER_ID = "plasmo-sidebar-container";
  private static readonly SIDEBAR_WIDTH = "400px";

  /**
   * Wrap body content to make room for sidebar.
   */
  static wrapBody(): void {
    const body = document.body;
    const html = document.documentElement;

    // Check if wrapper already exists
    let wrapper = document.getElementById(this.WRAPPER_ID) as HTMLDivElement;

    if (!wrapper) {
      // Create wrapper div
      wrapper = document.createElement("div");
      wrapper.id = this.WRAPPER_ID;

      // Move all body children (except sidebar container) into wrapper
      const childrenToMove: Node[] = [];
      for (let i = 0; i < body.childNodes.length; i++) {
        const child = body.childNodes[i];
        // Skip the sidebar container and the wrapper itself
        if (
          child.nodeType === Node.ELEMENT_NODE &&
          (child as Element).id !== this.SIDEBAR_CONTAINER_ID &&
          (child as Element).id !== this.WRAPPER_ID
        ) {
          childrenToMove.push(child);
        }
      }

      // Insert wrapper before sidebar container if it exists, otherwise at start
      const sidebarContainer = document.getElementById(
        this.SIDEBAR_CONTAINER_ID
      );
      if (sidebarContainer && sidebarContainer.parentNode === body) {
        body.insertBefore(wrapper, sidebarContainer);
      } else {
        body.insertBefore(wrapper, body.firstChild);
      }

      // Move children into wrapper
      childrenToMove.forEach((child) => wrapper.appendChild(child));
    }

    // Apply styles to wrapper
    wrapper.style.width = `calc(100% - ${this.SIDEBAR_WIDTH})`;
    wrapper.style.transition = "width 0.3s ease, transform 0.3s ease";
    html.style.overflowX = "hidden";
  }

  /**
   * Unwrap body content.
   */
  static unwrapBody(): void {
    const body = document.body;
    const html = document.documentElement;

    // Remove wrapper and move children back to body
    const wrapper = document.getElementById(this.WRAPPER_ID);
    if (wrapper && wrapper.parentNode === body) {
      // Collect all children first (before any DOM manipulation)
      const childrenToMove = Array.from(wrapper.childNodes);

      // Insert children before wrapper
      childrenToMove.forEach((child) => {
        body.insertBefore(child, wrapper);
      });

      // Remove wrapper
      wrapper.remove();
    }

    html.style.overflowX = "";
  }
}

