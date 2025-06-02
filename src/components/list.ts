import { LitElement, css, html, nothing } from 'lit';
import {customElement, state } from 'lit/decorators.js';

import { produce } from "immer"

import "./button";
import "./profile";
import "./form";

@customElement('profile-list')
export class ListProfilesElement extends LitElement {
    static override styles = css`
        :host {
            display: flex;
            margin: 0 auto !important;
            padding: 1rem 1rem 2rem;
            min-width: 600px;
            max-width: 1000px;
            flex-direction: column;
        }
        h1, p {
            margin: 0;
        }
        p {
            font-size: .9rem;
        }
        p.disabled {
            color: var(--color-error);
            font-weight: bold;
            padding: 0.5rem 0;
        }
        p.disabled button {
            outline: 0;
            background: inherit;
            border: none;
            color: inherit;
            font-weight: inherit;
            font-size: inherit;
            text-decoration: underline;
            cursor: pointer;
        }
        main {
            display: flex;
            flex-direction: column;
        }
        section.add {
            padding: 1rem;
            text-align: center;
        }
        section.add ext-button {
            margin: 0 auto;
            width: 200px;
            font-size: 1.1rem;
        }
        a { color: var(--color-primary-text-muted) }
        pre {
            text-align: left;
            background: var(--color-surface-mixed-200);
            padding: 1rem;
            border-radius: 1rem;
        }
        code {
            text-align: left;
            font-family: monospace;
            line-height: 1rem;
        }
        .delete-confirm-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }
        .delete-confirm-dialog {
            background: var(--color-surface-mixed-200);
            padding: 2rem;
            border-radius: 1rem;
            max-width: 400px;
            text-align: center;
        }
        .dialog-buttons {
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin-top: 1rem;
        }
    `;

    @state()
    protected _profiles: Profile[] = produce([], ()=> {});

    @state()
    protected _enabled: boolean = false;

    @state()
    protected _showProfileForm: boolean = false;

    @state()
    protected _showDebug: boolean = false;

    @state()
    protected _showDeleteConfirm: boolean = false;

    @state()
    protected _profileToDelete: Profile | null = null;

    override connectedCallback() {
        super.connectedCallback();

        chrome.storage.sync.get(["enabled", "profiles"], ((settings) => {
            const profiles = settings.profiles as Profile[];
            if(Array.isArray(profiles)) {
                this._profiles = produce(this._profiles, (draftState) => {
                    profiles.forEach((profile) => {
                        draftState.push(profile);
                    });
                });
            }

            this._enabled = settings.enabled;
        }));
    }

    override render() {
        const sortedProfiles = produce(this._profiles, (profiles) => {
            profiles.sort((a, b) => {
                if(a.id > b.id) { return 1; }
                if(a.id < b.id) { return -1; }
                return 0;
            });
        });

        return html`
            <header>
                <h1>X-Forwarded-For Header Profiles</h1>
                <p>Profiles allow you to use different values for different headers and/or domains. If multiple enabled profiles match a domain with the same header(s), the last profile will take precedence.</p>
                ${!this._enabled ?
                    html`<p class="disabled">${chrome.i18n.getMessage("profile_extension_disabled")} <button @click=${this._enableExtension}>${chrome.i18n.getMessage("btn_enable_extension")}</button></p>` :
                    nothing
                }
            </header>
            <main
                @editProfile=${this._editProfile}
                @deleteProfile=${this._showDeleteConfirmation}
                @moveProfile=${this._moveProfile}
            >
                ${sortedProfiles.length ? html`<section class="add"><ext-button @click=${this._toggleModal} class="btn-outline btn-success">${chrome.i18n.getMessage("btn_add_profile")}</ext-button></section>` : nothing}
                
                ${sortedProfiles.map((profile, index) => html`<profile-entry .profile=${profile} .index=${index} .totalProfiles=${sortedProfiles.length}></profile-entry>`)}

                <section class="add">
                    <ext-button @click=${this._toggleModal} class="btn-outline btn-success">${chrome.i18n.getMessage("btn_add_profile")}</ext-button>
                </section>

                ${this._showDeleteConfirm ? html`
                    <div class="delete-confirm-overlay">
                        <div class="delete-confirm-dialog">
                            <p>${chrome.i18n.getMessage("confirm_delete_message", [this._profileToDelete?.name || ""])}</p>
                            <div class="dialog-buttons">
                                <ext-button @click=${this._cancelDelete} class="btn-outline">${chrome.i18n.getMessage("btn_cancel")}</ext-button>
                                <ext-button @click=${this._confirmDelete} class="btn-outline btn-danger">${chrome.i18n.getMessage("btn_yes")}</ext-button>
                            </div>
                        </div>
                    </div>
                ` : nothing}
                
                ${this._showProfileForm ? html`<profile-form @closeModal=${this._toggleModal}></profile-form>` : nothing }
            </main>
            <p>
                This extension does not force an IP address format; passing an invalid IP address or multiple IP addresses when the server is not expecting it may cause issues and your request might be rejected.
            </p>
            <p>
                This extension has recently been updated and is not 100% complete.
                Additional features and visual tweaks will be coming in the near future.
                Any bugs found can be reported at <a href="https://github.com/MisterPhilip/x-forwarded-for/issues">https://github.com/MisterPhilip/x-forwarded-for/issues</a>.
                Please include the debug information below to help with the issue.
            </p>
            <section class="add">
                <ext-button @click=${this._toggleDebug} class="btn-outline">${chrome.i18n.getMessage("btn_copy_debug")}</ext-button>
                ${this._showDebug ?
                    html`<p>Unable to copy directly to your clipboard, please copy the following debug info.</p><pre><code>${JSON.stringify(sortedProfiles, null, "  ")}</code></pre>` :
                    nothing
                }
            </section>
        `
    }

    protected _toggleModal(event: Event) {
        event.preventDefault();
        this._showProfileForm = !this._showProfileForm;
    }

    protected _toggleDebug(event: Event) {
        event.preventDefault();
        try {
            navigator.clipboard.writeText(JSON.stringify(this._profiles, null, "  "));
        } catch(e) {
            this._showProfileForm = true;
        }
    }

    protected _editProfile(event: CustomEvent) {
        const profileId = event.detail.id;

        if(typeof profileId !== "number" || profileId < 0) {
            this._profiles = produce(this._profiles, (draftState) => {
                const profile = Object.assign(
                    {
                        id: (draftState.length + 1),
                        "enabled": true
                    },
                    event.detail
                );
                draftState.push(profile);
            });
            this._saveProfiles();
            // @TODO: Success message
        } else {
            const index = this._profiles.findIndex((profile) => profile.id === profileId);
            if (index !== -1) {
                this._profiles = produce(this._profiles, (draftState) => {
                    draftState[index] = Object.assign(
                        draftState[index],
                        event.detail
                    );
                });
                this._saveProfiles();
            } else {
                // @TODO: Error message, cannot find profile
            }
        }
    }

    protected _deleteProfile(event: CustomEvent) {
        const profileId = event.detail.id;
        const profile = this._profiles.find(p => p.id === profileId);
        if (profile) {
            this._profileToDelete = profile;
            this._showDeleteConfirm = true;
        }
    }

    protected _showDeleteConfirmation(event: CustomEvent) {
        const profileId = event.detail.id;
        const profile = this._profiles.find(p => p.id === profileId);
        if (profile) {
            this._profileToDelete = profile;
            this._showDeleteConfirm = true;
        }
    }

    protected _confirmDelete() {
        if (!this._profileToDelete) return;
        const profileId = this._profileToDelete.id;
        const index = this._profiles.findIndex((profile) => profile.id === profileId);
        if(index !== -1) {
            this._profiles = produce(this._profiles, (draftState) => {
                draftState.splice(index, 1);
                draftState
                    .filter((profile) => profile.id > profileId)
                    .forEach((profile) => {
                        profile.id--;
                    });
            });
            this._saveProfiles();
        }
        this._cancelDelete();
    }

    protected _cancelDelete() {
        this._showDeleteConfirm = false;
        this._profileToDelete = null;
    }

    protected _moveProfile(event: CustomEvent) {
        const profileId = event.detail.id,
              amount = event.detail.amount,
              currIndex = this._profiles.findIndex((profile) => profile.id === profileId),
              newIndex = this._profiles.findIndex((profile) => profile.id === profileId + amount);

        if(currIndex !== -1 && newIndex !== -1) {
            this._profiles = produce(this._profiles, (draftState) => {
                // Swap the positions in the array
                const cachedId = draftState[currIndex].id;
                draftState[currIndex].id = draftState[newIndex].id;
                draftState[newIndex].id =cachedId;
            });
            this._saveProfiles();
        } else {
            // @TODO: Error message, invalid profiles
        }
    }

    protected async _saveProfiles() {
        await chrome.storage.sync.set({
            profiles: this._profiles
        });
        // @TODO: success/fail messages

        // @TODO: change to immutable pattern
        console.log("saving profile, requesting update");
    }

    protected async _enableExtension(event: Event) {
        event.preventDefault();
        await chrome.storage.sync.set({
            enabled: true
        });
        this._enabled = true;
        // @TODO: success/fail messages
    }
}