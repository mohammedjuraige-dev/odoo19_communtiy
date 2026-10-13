/** @odoo-module **/

import { Component, useRef, onMounted, onWillUnmount, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { computeAppsAndMenuItems } from "@web/webclient/menus/menu_helpers";
import { fuzzyScore, highlightMatches } from "./fuzzy_search";

export class HomeMenu extends Component {
    static template = "community_enterprise_theme_lite_pr.HomeMenu";
    static props = {
        onAppClick: { type: Function, optional: true },
    };

    setup() {
        this.menuService = useService("menu");
        this.ui = useService("ui");

        this.searchInputRef = useRef("searchInput");
        this.scrollableRef = useRef("scrollable");

        this.state = useState({
            inputText: "",
            activeQuery: "",
            focusedIndex: 0,
            isSearchVisible: false,
        });

        this._cachedData = null;
        this._debounceTimer = null;

        onMounted(() => {
            this._buildIndex();
            window.addEventListener("keydown", this.onWindowKeydown);
        });

        onWillUnmount(() => {
            if (this._debounceTimer) {
                clearTimeout(this._debounceTimer);
            }
            window.removeEventListener("keydown", this.onWindowKeydown);
        });
    }

    /**
     * Pre-indexes apps and submenus in client memory once on mount.
     */
    _buildIndex() {
        if (!this.menuService) {
            this._cachedData = { apps: [], menuItems: [] };
            return;
        }

        const menuTree = this.menuService.getMenuAsTree("root");
        const { apps = [], menuItems = [] } = (menuTree && computeAppsAndMenuItems(menuTree)) || {};

        const formattedApps = (Array.isArray(apps) ? apps : []).map(app => {
            let webIconData = app.webIconData;
            if (webIconData && !webIconData.startsWith("data:image")) {
                const prefix = webIconData.startsWith("P")
                    ? "data:image/svg+xml;base64,"
                    : "data:image/png;base64,";
                webIconData = prefix + webIconData.replace(/\s/g, "");
            }
            const label = app.label || app.name || "";
            return {
                ...app,
                webIconData,
                type: "app",
                label,
            };
        });

        const appMap = new Map();
        for (const app of formattedApps) {
            appMap.set(app.id, app);
        }

        const formattedMenuItems = (Array.isArray(menuItems) ? menuItems : []).map(item => {
            const itemLabel = item.label || item.name || "";
            const parentsStr = Array.isArray(item.parents)
                ? item.parents.join(" / ")
                : (item.parents || "");
            const fullPath = parentsStr ? `${parentsStr} / ${itemLabel}` : itemLabel;

            const parentApp = appMap.get(item.appID);
            let webIconData = item.webIconData || (parentApp && parentApp.webIconData);
            if (webIconData && !webIconData.startsWith("data:image")) {
                const prefix = webIconData.startsWith("P")
                    ? "data:image/svg+xml;base64,"
                    : "data:image/png;base64,";
                webIconData = prefix + webIconData.replace(/\s/g, "");
            }
            const webIcon = item.webIcon || (parentApp && parentApp.webIcon);

            return {
                ...item,
                type: "menu_item",
                label: itemLabel,
                parentsStr,
                fullPath,
                webIconData,
                webIcon,
            };
        });

        this._cachedData = {
            apps: formattedApps,
            menuItems: formattedMenuItems,
        };
    }

    get indexData() {
        if (!this._cachedData) {
            this._buildIndex();
        }
        return this._cachedData;
    }

    get isSearching() {
        return Boolean(this.state.activeQuery && this.state.activeQuery.trim().length > 0);
    }

    get searchResults() {
        const query = this.state.activeQuery ? this.state.activeQuery.trim() : "";
        const { apps, menuItems } = this.indexData;

        if (!query) {
            return { apps, menuItems: [] };
        }

        // 1. Filter Apps
        const matchedApps = [];
        for (let i = 0; i < apps.length; i++) {
            const app = apps[i];
            const score = fuzzyScore(query, app.label);
            if (score > 0) {
                matchedApps.push({
                    ...app,
                    score,
                    labelSegments: highlightMatches(app.label, query),
                });
            }
        }
        matchedApps.sort((a, b) => b.score - a.score);

        // 2. Filter Menu Items (capped at top 35 for 60FPS DOM rendering)
        const matchedMenuItems = [];
        for (let i = 0; i < menuItems.length; i++) {
            const item = menuItems[i];
            const pathScore = fuzzyScore(query, item.fullPath);
            const labelScore = fuzzyScore(query, item.label);
            const score = Math.max(pathScore, labelScore * 1.1);

            if (score > 0) {
                matchedMenuItems.push({
                    ...item,
                    score,
                    labelSegments: highlightMatches(item.label, query),
                    parentSegments: highlightMatches(item.parentsStr, query),
                });
            }
        }
        matchedMenuItems.sort((a, b) => b.score - a.score);

        const cappedMenuItems = matchedMenuItems.slice(0, 35);

        return { apps: matchedApps, menuItems: cappedMenuItems };
    }

    get displayedApps() {
        return this.searchResults.apps;
    }

    get displayedMenuItems() {
        return this.searchResults.menuItems;
    }

    get flatResults() {
        if (!this.isSearching) {
            return this.displayedApps;
        }
        return [...this.displayedApps, ...this.displayedMenuItems];
    }

    getItemFlatIndex(itemIndex) {
        return this.displayedApps.length + itemIndex;
    }

    onSearchInput(ev) {
        const val = ev.target.value;
        this.state.inputText = val;

        if (!val || !val.trim()) {
            if (this._debounceTimer) clearTimeout(this._debounceTimer);
            this.state.activeQuery = "";
            this.state.isSearchVisible = false;
            this.state.focusedIndex = 0;
            return;
        }

        this.state.isSearchVisible = true;

        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this.state.activeQuery = this.state.inputText;
            this.state.focusedIndex = 0;
        }, 120);
    }

    triggerSearch() {
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this.state.isSearchVisible = true;
        this.state.activeQuery = this.state.inputText;
        this.state.focusedIndex = 0;
    }

    clearSearch() {
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this.state.inputText = "";
        this.state.activeQuery = "";
        this.state.isSearchVisible = false;
        this.state.focusedIndex = 0;
    }

    onItemHover(index) {
        this.state.focusedIndex = index;
    }

    onItemClicked(item) {
        this.menuService.selectMenu(item);
    }

    onWindowKeydown = (ev) => {
        if (ev.ctrlKey || ev.altKey || ev.metaKey) {
            return;
        }
        const target = ev.target;
        const tag = target ? target.tagName : "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (target && target.isContentEditable)) {
            return;
        }

        const isSpace = ev.key === " " || ev.code === "Space" || ev.key === "Spacebar" || ev.keyCode === 32;
        const isPrintable = (ev.key && ev.key.length === 1) || isSpace;

        if (isPrintable && !ev.isComposing) {
            this.state.isSearchVisible = true;
            const charToAppend = isSpace ? " " : ev.key;
            this.state.inputText += charToAppend;
            this.triggerSearch();

            setTimeout(() => {
                this._focusInput();
            }, 0);

            ev.preventDefault();
        }
    };

    onItemKeydown(ev, item) {
        const isSpace = ev.key === " " || ev.code === "Space" || ev.key === "Spacebar" || ev.keyCode === 32;
        if (ev.key === "Enter" || isSpace) {
            ev.preventDefault();
            ev.stopPropagation();
            this.onItemClicked(item);
        }
    }

    onKeydown(ev) {
        const isSpace = ev.key === " " || ev.code === "Space" || ev.key === "Spacebar" || ev.keyCode === 32;

        if (isSpace) {
            this.triggerSearch();
        }

        const flat = this.flatResults;
        if (!flat.length) {
            if (ev.key === "Escape") {
                this.clearSearch();
                ev.preventDefault();
            }
            return;
        }

        switch (ev.key) {
            case "ArrowDown":
                ev.preventDefault();
                this.state.focusedIndex = (this.state.focusedIndex + 1) % flat.length;
                this._scrollToFocused();
                break;
            case "ArrowUp":
                ev.preventDefault();
                this.state.focusedIndex = (this.state.focusedIndex - 1 + flat.length) % flat.length;
                this._scrollToFocused();
                break;
            case "Enter":
                ev.preventDefault();
                this.triggerSearch();
                if (flat[this.state.focusedIndex]) {
                    this.onItemClicked(flat[this.state.focusedIndex]);
                }
                break;
            case "Escape":
                ev.preventDefault();
                this.clearSearch();
                break;
        }
    }

    _scrollToFocused() {
        setTimeout(() => {
            if (!this.scrollableRef.el) return;
            const activeEl = this.scrollableRef.el.querySelector(".o_menu_search_item.active, .o_app.active");
            if (activeEl) {
                activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
        }, 0);
    }

    get backgroundImageStyle() {
        const url = `/community_enterprise_theme_lite_pr/static/img/light/background-light.jpg`;
        return `background-image: url("${url}") !important; background-size: cover !important; background-position: center !important; background-repeat: no-repeat !important;`;
    }

    _focusInput() {
        if (this.searchInputRef.el) {
            this.searchInputRef.el.focus({ preventScroll: true });
        }
    }
}
