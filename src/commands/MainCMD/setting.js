const {
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
} = require("discord.js");
const { getPaginationRow, createFastNavigateModal } = require("../Utils/NavigateManager");
const { execSync } = require("child_process");
const { version: PKG_VERSION } = require("../../../package.json");
const { getSettings } = require("./stgfiles");

const COMMIT_COUNT = (() => {
    try { return execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim(); }
    catch { return "0"; }
})();
const BOT_VERSION = `v${PKG_VERSION}.${COMMIT_COUNT}`;

const SETTINGS = getSettings();

const ITEMS_PER_PAGE = 5;

const getUserSettings = async (db, userId) => {
    try {
        return await db.getUserSettings(userId);
    } catch {
        return {};
    }
};

const buildSettingsPage = (allSettings, page, userSettings) => {
    const totalPages = Math.max(1, Math.ceil(allSettings.length / ITEMS_PER_PAGE));
    const start = page * ITEMS_PER_PAGE;
    const paged = allSettings.slice(start, start + ITEMS_PER_PAGE);

    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent("## \u2699\uFE0F  Settings")
    );
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${BOT_VERSION}`)
    );
    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );
    if (paged.length === 0) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent("*No settings available.*")
        );
    } else {
        paged.forEach((setting) => {
            const isEnabled = !!(userSettings[setting.id]);
            container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `**${setting.label}**\n-# ${setting.description}`
                        )
                    )
                    .setButtonAccessory(
                        new ButtonBuilder()
                            .setCustomId(`toggle_${setting.id}`)
                            .setLabel(isEnabled ? "ON" : "OFF")
                            .setStyle(isEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
                    )
            );
        });
    }
    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Page ${page + 1} of ${totalPages}`)
    );
    if (totalPages > 1) {
        container.addActionRowComponents(
            getPaginationRow(page, totalPages, { includeFastNavigate: true })
        );
    }

    return { container, totalPages };
};

module.exports = {
    name: "settings",
    aliases: ["setting", "config"],
    description: "View and manage your personal bot settings",
    category: "gnr",
    usage: "Zsettings",

    async execute(message) {
        let currentPage = 0;
        let userSettings = await getUserSettings(message.client.db, message.author.id);

        const { container: initContainer } = buildSettingsPage(
            SETTINGS, currentPage, userSettings
        );

        const response = await message.channel.send({
            components: [initContainer],
            flags: MessageFlags.IsComponentsV2,
        });

        const collector = response.createMessageComponentCollector();

        const refresh = async (i) => {
            await i.deferUpdate();
            const { container } = buildSettingsPage(
                SETTINGS, currentPage, userSettings
            );
            return response.edit({ components: [container] }).catch((error) => {
                if (error.code !== 10062) console.error("Failed to update settings menu:", error);
            });
        };

        collector.on("collect", async (i) => {
            if (i.user.id !== message.author.id) {
                return i.reply({ content: "These are not your settings!", ephemeral: true });
            }

            message.client.db.recordUserActivity(message.author.id).catch(() => { });

            if (i.isButton() && i.customId === "fast_navigate") {
                const totalPages = Math.max(1, Math.ceil(SETTINGS.length / ITEMS_PER_PAGE));
                const modal = createFastNavigateModal(totalPages, `fast_navigate_modal_${i.id}`);
                await i.showModal(modal);

                try {
                    const submitted = await i.awaitModalSubmit({
                        filter: (modalInt) => modalInt.customId === `fast_navigate_modal_${i.id}` && modalInt.user.id === message.author.id,
                        time: 60_000,
                    });

                    const rawInput = submitted.fields.getTextInputValue("page_input")?.trim();
                    const targetPageNum = parseInt(rawInput, 10);

                    if (isNaN(targetPageNum) || targetPageNum < 1 || targetPageNum > totalPages) {
                        return submitted.reply({
                            content: `Invalid page! Please enter a number between 1 and ${totalPages}.`,
                            ephemeral: true,
                        });
                    }

                    currentPage = targetPageNum - 1;
                    await submitted.deferUpdate();
                    const { container } = buildSettingsPage(SETTINGS, currentPage, userSettings);

                    return response.edit({ components: [container] });
                } catch {
                    // Modal submission timed out or closed
                    return;
                }
            }

            if (i.isButton() && ["prev", "next", "first", "last"].includes(i.customId)) {
                const totalPages = Math.max(1, Math.ceil(SETTINGS.length / ITEMS_PER_PAGE));
                switch (i.customId) {
                    case "first": currentPage = 0; break;
                    case "prev": currentPage = Math.max(0, currentPage - 1); break;
                    case "next": currentPage = Math.min(totalPages - 1, currentPage + 1); break;
                    case "last": currentPage = totalPages - 1; break;
                }
                return refresh(i);
            }

            if (i.isButton() && i.customId.startsWith("toggle_")) {
                const settingId = i.customId.slice("toggle_".length);
                const setting = SETTINGS.find((entry) => entry.id === settingId);
                if (!setting) return i.deferUpdate();

                const newValue = setting.toggle(userSettings);
                await i.deferUpdate();

                try {
                    await message.client.db.setUserSetting(message.author.id, settingId, newValue);
                } catch {
                    return i.followUp({ content: "Couldn't save this setting. Please try again.", ephemeral: true });
                }

                userSettings = { ...userSettings, [settingId]: newValue };

                const { container } = buildSettingsPage(SETTINGS, currentPage, userSettings);
                return response.edit({ components: [container] });
            }
        });
    },
};
