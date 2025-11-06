import type { PlasmoCSConfig } from "plasmo"
import { createRoot } from "react-dom/client"
import { Sidebar } from "./components/Sidebar"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  css: ["content.css"],

}



// Global state for sidebar visibility
let sidebarVisible = false
let sidebarRoot: ReturnType<typeof createRoot> | null = null
let sidebarContainer: HTMLDivElement | null = null

// Function to toggle sidebar visibility
function toggleSidebar() {
  sidebarVisible = !sidebarVisible
  updateSidebar(true)
}

// Function to close sidebar
function closeSidebar() {
  sidebarVisible = false
  updateSidebar(true)
}

// Function to update sidebar visibility
function updateSidebar(refresh:boolean=false) {
  if (!sidebarContainer || !sidebarRoot) {
    // Create container if it doesn't exist
    sidebarContainer = document.createElement("div")
    sidebarContainer.id = "plasmo-sidebar-container"
    document.body.appendChild(sidebarContainer)
    sidebarRoot = createRoot(sidebarContainer)
  }

  // Render or update sidebar
  sidebarRoot.render(
    <Sidebar isVisible={sidebarVisible} isRefresh={refresh} onClose={closeSidebar} />
  )
}

// Inject sidebar container into the page
function injectSidebar() {
  // Create container for sidebar
  sidebarContainer = document.createElement("div")
  sidebarContainer.id = "plasmo-sidebar-container"
  document.body.appendChild(sidebarContainer)

  // Create root and render sidebar (initially hidden)
  sidebarRoot = createRoot(sidebarContainer)
  updateSidebar(false)
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "toggle-sidebar") {
    toggleSidebar()
    sendResponse({ success: true })
  }
  return true
})

// Wait for DOM to be ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectSidebar)
} else {
  injectSidebar()
}
