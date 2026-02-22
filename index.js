require('dotenv').config();
const { Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType, REST, Routes, ApplicationCommandOptionType, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');

// === CONFIGURAÇÃO DO CLIENT ===
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel]
});

// === VARIÁVEIS GLOBAIS ===
const COOLDOWN = new Set();// Banco de dados simplificado da loja
let DATA_LOJA = {
    viajante: { preco: 50000000000, id: '' },
    sombra: { preco: 150000000000, id: '' },
    lorde: { preco: 500000000000, id: '' },
    rubi: { preco: 10000000000, id: '' },
    safira: { preco: 10000000000, id: '' },
    esmeralda: { preco: 10000000000, id: '' },
    vip: { preco: 25000000000, id: '' }
};

// Tenta carregar se você já tiver salvo (opcional, mas recomendado)
if (fs.existsSync('./loja_config.json')) {
    DATA_LOJA = JSON.parse(fs.readFileSync('./loja_config.json', 'utf8'));
}

function salvarLoja() {
    fs.writeFileSync('./loja_config.json', JSON.stringify(DATA_LOJA, null, 2));
}
// Cooldown de XP
let xpLogEnabled = false;
let xpLogChannelId = null;

// === CONSTANTES DE RECOMPENSA ===
const VOICE_REWARD_INTERVAL = 60000; // 1 minuto em ms
const VOICE_REWARD_PER_INTERVAL = 50; // $50 por minuto no banco
const CHAT_REWARD_MIN = 10; // Mínimo $10 por mensagem no banco
const CHAT_REWARD_MAX = 20; // Máximo $20 por mensagem no banco
const LEVEL_UP_REWARD_BASE = 500; // $500 base por subida de nível

// === VARIÁVEIS GLOBAIS ===

const LEVELS = Array.from({ length: 1000 }, (_, i) => (i + 1) * (i + 1) * 100);
let xp = {}, voiceConfig = {}, leaderboardConfig = {}, welcomeConfig = {}, antinukeConfig = {}, logConfig = {}, autopfpConfig = {}, economy = {}, economyLeaderboardConfig = {}, rankingRolesConfig = {};
const voiceXP = {}; // { userId: { guildId: { channelId: timestamp } } }

const tempVcOwners = new Map(); // Armazena [channelId, ownerId]
const autopfpIntervals = new Map(); // Armazena [guildId, intervalId]
const IMAGE_FOLDER = './autopfp_images';

// === FUNÇÕES DE ARQUIVO ===
function loadConfig(file, configVar, varName) { try { if (fs.existsSync(file)) { Object.assign(configVar, JSON.parse(fs.readFileSync(file, 'utf8'))); console.log(`✅ ${varName} carregado.`); } else { console.log(`⚠️ Arquivo de ${varName} não encontrado.`); } } catch (e) { console.error(`❌ Erro ao carregar ${varName}:`, e); } }
function saveConfig(file, configVar) { try { fs.writeFileSync(file, JSON.stringify(configVar, null, 2)); } catch (e) { console.error(`❌ Erro ao salvar ${file}:`, e); } }
function loadAllConfigs() { loadConfig('./xp.json', xp, 'XP'); loadConfig('./voiceConfig.json', voiceConfig, 'Voz Temporária'); loadConfig('./leaderboard_config.json', leaderboardConfig, 'Leaderboard'); loadConfig('./welcome_config.json', welcomeConfig, 'Boas-vindas'); loadConfig('./logConfig.json', logConfig, 'Logs'); loadConfig('./antinukeConfig.json', antinukeConfig, 'Antinuke'); loadConfig('./autopfpConfig.json', autopfpConfig, 'AutoPFP'); loadConfig('./economy.json', economy, 'Economia'); loadConfig('./economy_leaderboard_config.json', economyLeaderboardConfig, 'Leaderboard Economia'); loadConfig('./ranking_roles_config.json', rankingRolesConfig, 'Cargos de Ranking'); }
const saveXP = () => saveConfig('./xp.json', xp);
const saveVoiceConfig = () => saveConfig('./voiceConfig.json', voiceConfig);
const saveLeaderboardConfig = () => saveConfig('./leaderboard_config.json', leaderboardConfig);
const saveWelcomeConfig = () => saveConfig('./welcome_config.json', welcomeConfig);
const saveLogConfig = () => saveConfig('./logConfig.json', logConfig);
const saveAntinukeConfig = () => saveConfig('./antinukeConfig.json', antinukeConfig);
const saveAutoPfpConfig = () => saveConfig('./autopfpConfig.json', autopfpConfig);
	const saveEconomy = () => saveConfig('./economy.json', economy);
	const saveEconomyLeaderboardConfig = () => saveConfig('./economy_leaderboard_config.json', economyLeaderboardConfig);
const saveRankingRolesConfig = () => saveConfig('./ranking_roles_config.json', rankingRolesConfig);

// === FUNÇÕES DE ECONOMIA ===
	function getUser(userId, username) {
	    if (!economy[userId]) {
	        economy[userId] = {
	            username: username,
	            wallet: 0,
	            bank: 0,
	            lastDaily: 0,
	            lastCrash: 0,
	            cooldowns: {} // Para comandos como coinflip, etc.
	        };
	        saveEconomy();
	    }
	    // Atualiza o username em caso de mudança
	    if (economy[userId].username !== username) {
	        economy[userId].username = username;
	        saveEconomy();
	    }
	    return economy[userId];
	}
	
		function updateUser(userId, data) {
		    if (!economy[userId]) return false;
		    Object.assign(economy[userId], data);
		    saveEconomy(); // A chamada a saveEconomy estava faltando aqui.
		    return true;
		}
	
		function formatDollars(amount) {
		    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
		}
		
		// === FUNÇÃO DE XP ===
		function getLevel(xp) {
		    let level = 0;
		    while (level < LEVELS.length && xp >= LEVELS[level]) {
		        level++;
		    }
		    return level;
		}
		
		async function addXP(guild, user, channel) {
		    // Ignora bots e interações sem guild (DMs)
		    if (user.bot || !guild) return; 
		    
		    const guildId = guild.id, userId = user.id;
		    if (!xp[guildId]) xp[guildId] = {};
		
    // Verifica Cooldown de XP
    const cooldownKey = `${guildId}-${userId}`;
    if (COOLDOWN.has(cooldownKey)) return;

    // === Recompensa de Economia por Chat ===
    const chatRewardAmount = Math.floor(Math.random() * (CHAT_REWARD_MAX - CHAT_REWARD_MIN + 1)) + CHAT_REWARD_MIN;
    const userData = getUser(userId, user.tag); // Obtém a referência para os dados do usuário
    userData.bank += chatRewardAmount;
    // Opcional: Notificar o usuário sobre o ganho de dinheiro
    // channel.send(`💰 ${user} ganhou ${formatDollars(chatRewardAmount)} por interagir no chat!`).catch(() => {});

    const currentXP = xp[guildId][userId] || 0;
    const currentLevel = getLevel(currentXP);
    
    // Ganho de XP (entre 15 e 25)
    xp[guildId][userId] = currentXP + Math.floor(Math.random() * 11) + 15; 
    
    // Verifica subida de nível
    const newLevel = getLevel(xp[guildId][userId]);
    if (newLevel > currentLevel) {
        // Recompensa por subida de nível
        const levelUpReward = LEVEL_UP_REWARD_BASE * newLevel;
        userData.bank += levelUpReward; // Usa a mesma referência de userData

        channel.send(`🎉 Parabéns, ${user}! Você subiu para o **Nível ${newLevel}** e ganhou **${formatDollars(levelUpReward)}** no banco!`).catch(() => {});
    }

    // Salva as alterações de economia (chat reward e/ou level up reward)
    updateUser(userId, userData);
		
		    
    // Log de XP e Dinheiro (Chat)
    if (xpLogEnabled && xpLogChannelId) {
        const logChannel = guild.channels.cache.get(xpLogChannelId);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setColor("#000000")
                .setAuthor({ name: `Log de Recompensas | ${user.username}`, iconURL: user.displayAvatarURL({ dynamic: true }) })
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .setDescription(`### ✨ Recompensa de Chat
O usuário **${user.username}** interagiu no chat e recebeu suas recompensas!`)
                .addFields(
                    { name: "💬 Canal", value: `<#${channel.id}>`, inline: true },
                    { name: "✨ XP Ganho", value: `\`+${xp[guildId][userId] - currentXP} XP\``, inline: true },
                    { name: "💰 Dinheiro", value: `\`${formatDollars(chatRewardAmount)}\``, inline: true },
                    { name: "📊 Nível Atual", value: `\`Lvl ${getLevel(xp[guildId][userId])}\``, inline: true },
                    { name: "📈 XP Total", value: `\`${xp[guildId][userId]}\``, inline: true }
                )
                .setFooter({ text: "Void Economy • Logs", iconURL: client.user.displayAvatarURL() })
                .setTimestamp();
            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
    }
    
                        saveXP();
		
		    // Aplica Cooldown
		    COOLDOWN.add(cooldownKey);
		    setTimeout(() => COOLDOWN.delete(cooldownKey), 60000); // 60 segundos de cooldown
		}
	
		async function getEconomyLeaderboardEmbed() {
		    const economyWithTotal = Object.entries(economy)
		        .map(([userId, data]) => {
		            const total = data.wallet + data.bank;
		            return { userId, data, total };
		        })
		        .filter(entry => entry.total > 0); // Apenas usuários com dinheiro total > 0
		
		    const sortedEconomy = economyWithTotal
		        .sort((entryA, entryB) => entryB.total - entryA.total)
		        .slice(0, 10);
		
		    let leaderboardText = "Ninguém ainda possui Dollars na carteira ou no banco.";
		    if (sortedEconomy.length > 0) {
		        leaderboardText = sortedEconomy.map((entry, index) => {
		            // Tenta buscar o usuário pelo ID para garantir o nick mais recente, mas usa o nick salvo como fallback
		            const userTag = entry.data.username;
		            return `**#${index + 1}** ${userTag} - **${formatDollars(entry.total)}**`;
		        }).join('\n');
		    }
		
		    return new EmbedBuilder().setColor("#000000")
		        .setTitle(`Economia do Void - Top10`)
		        .setDescription(leaderboardText)
		        .setColor("#000000")
		        .setFooter({ text: "Atualizado a cada 30 segundos. Ranking Global." })
		        .setTimestamp();
		}
	
	// === FUNÇÕES DE RECOMPENSA DE VOZ ===
function rewardVoiceUsers() {
    const now = Date.now();
    
    // Varre todas as guildas que o bot está
    client.guilds.cache.forEach(guild => {
        const guildId = guild.id;
        
        // Varre todos os canais de voz da guilda
        guild.channels.cache.filter(c => c.type === 2).forEach(channel => {
            const channelId = channel.id;
            
            // Varre todos os membros no canal de voz
            channel.members.forEach(member => {
                if (member.user.bot) return;
                const userId = member.id;
                
                // Inicializa o rastreamento se necessário
                if (!voiceXP[userId]) voiceXP[userId] = {};
                if (!voiceXP[userId][guildId]) voiceXP[userId][guildId] = {};
                if (!voiceXP[userId][guildId][channelId]) {
                    voiceXP[userId][guildId][channelId] = now;
                    return;
                }
                
                const lastRewardTime = voiceXP[userId][guildId][channelId];
                const timeElapsed = now - lastRewardTime;
                
                if (timeElapsed >= VOICE_REWARD_INTERVAL) {
                    const intervals = Math.floor(timeElapsed / VOICE_REWARD_INTERVAL);
                    const rewardAmount = intervals * VOICE_REWARD_PER_INTERVAL;
                    const xpGain = intervals * 10;
                    
                    if (!xp[guildId]) xp[guildId] = {};
                    const currentXP = xp[guildId][userId] || 0;
                    const currentLevel = getLevel(currentXP);
                    xp[guildId][userId] = currentXP + xpGain;
                    saveXP();
                    
                    const userData = getUser(userId, member.user.tag);
                    userData.bank += rewardAmount;
                    
                    const newLevel = getLevel(xp[guildId][userId]);
                    if (newLevel > currentLevel) {
                        const levelUpReward = LEVEL_UP_REWARD_BASE * newLevel;
                        userData.bank += levelUpReward;
                    }
                    
                    updateUser(userId, userData);
                    
                    // Log
                    if (xpLogEnabled && xpLogChannelId) {
                        const logChannel = guild.channels.cache.get(xpLogChannelId);
                        if (logChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setColor("#000000")
                                .setAuthor({ name: `Log de Recompensas | ${member.user.username}`, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
                                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                                .setDescription(`### 🎙️ Recompensa de Voz\nO usuário **${member.user.username}** recebeu recompensas por seu tempo em call!`)
                                .addFields(
                                    { name: "🎙️ Canal", value: `<#${channelId}>`, inline: true },
                                    { name: "⏱️ Tempo", value: `\`${intervals} min\``, inline: true },
                                    { name: "✨ XP Ganho", value: `\`+${xpGain} XP\``, inline: true },
                                    { name: "💰 Dinheiro", value: `\`${formatDollars(rewardAmount)}\``, inline: true },
                                    { name: "📊 Nível Atual", value: `\`Lvl ${getLevel(xp[guildId][userId])}\``, inline: true },
                                    { name: "📈 XP Total", value: `\`${xp[guildId][userId]}\``, inline: true }
                                )
                                .setFooter({ text: "Void Economy • Logs", iconURL: client.user.displayAvatarURL() })
                                .setTimestamp();
                            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
                        }
                    }
                    
                    voiceXP[userId][guildId][channelId] = now - (timeElapsed % VOICE_REWARD_INTERVAL);
                }
            });
        });
    });
    
    // Limpeza
    for (const userId in voiceXP) {
        for (const guildId in voiceXP[userId]) {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) { delete voiceXP[userId][guildId]; continue; }
            for (const channelId in voiceXP[userId][guildId]) {
                const channel = guild.channels.cache.get(channelId);
                if (!channel || !channel.members.has(userId)) {
                    delete voiceXP[userId][guildId][channelId];
                }
            }
            if (Object.keys(voiceXP[userId][guildId]).length === 0) delete voiceXP[userId][guildId];
        }
        if (Object.keys(voiceXP[userId]).length === 0) delete voiceXP[userId];
    }
}

// === FUNÇÕES PRINCIPAIS ===
	
	async function handleRanking(interaction) {
	    const embed = await getEconomyLeaderboardEmbed();
	    await interaction.reply({ embeds: [embed] });
	}
	
	// === HANDLER DE COMANDO /SETRULESCHANNEL ===
async function handleSetRulesChannel(interaction) {
    // URL da imagem de banner "Rules" (O usuário deve substituir por uma URL válida após fazer o upload)
    const RULES_BANNER_URL = 'https://i.imgur.com/OmxGwj8.png'; // SUBSTITUÍDO PELO USUÁRIO



    // Conteúdo das Regras
    const rulesContent = [
        {
            name: '🚫 1. Comportamento Tóxico e Discriminação',
            value: 'É **extremamente proibido** qualquer tipo de agressão verbal, preconceito ou prática de discriminação (homofobia, racismo, xenofobia, assédio, ou qualquer outro comportamento tóxico), ameaças ou ofensas a um indivíduo. O Vazio não tolera o ódio.',
            inline: false,
        },
        {
            name: '🔗 2. Divulgação e Spam',
            value: 'Divulgação de outros servidores (seja link de convite ou de qualquer outra forma) sem permissão da STAFF é proibida. Evite qualquer tipo de flood/spam que polua o ambiente com mensagens indesejadas. A insistência atrai a punição.',
            inline: false,
        },
        {
            name: '🎫 3. Comunicação com a Staff',
            value: 'Não chame nenhum membro da Staff no privado para tirar satisfação. Questões relacionadas ao servidor são resolvidas **dentro do servidor**, preferencialmente por meio de um **ticket**.',
            inline: false,
        },
        {
            name: '💸 4. Promoção Ilegal e Cheats',
            value: 'Qualquer tipo de promoção de servidores, trocas ou vendas de produtos, vídeos e/ou links em chats fora dos canais designados, e a promoção de **cheats ou programas ilegais** irão causar punição imediata. Mantenha a integridade do Void.',
            inline: false,
        },
        {
            name: '🔊 5. Poluição Sonora (Voice Chat)',
            value: 'Poluição sonora em canais de voz (gritar, interromper, entrar/sair repetidamente, colocar efeitos sonoros) apenas para atrapalhar os demais players que estão tentando conversar/jogar, irá gerar punição. Respeite o silêncio do Vazio.',
            inline: false,
        },
        {
            name: '🤖 6. Uso de Comandos',
            value: 'Não utilize comandos fora dos canais designados para comandos (como no chat geral). O descumprimento levará a um aviso e, na reincidência, as devidas punições serão aplicadas.',
            inline: false,
        },
        {
            name: '⚔️ 7. Respeito à Staff e Membros',
            value: 'Ofensa à Staff ou menção de membros da equipe sem motivo e atitudes indesejadas (como provocações/implicância) causarão punição. A hierarquia do Vazio deve ser respeitada.',
            inline: false,
        },
    ];

    // 1. Verificação de Permissão (Apenas Administradores)
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ 
            content: 'Você não tem permissão para usar este comando. Apenas Administradores podem definir as regras do Vazio.', 
            ephemeral: true 
        });
    }

    const channel = interaction.options.getChannel('channel');

    // 2. Criação do Embed de Regras
    const rulesEmbed = new EmbedBuilder()
        .setColor("#000000")
        .setTitle('🌌 O CÓDIGO DO VAZIO')
        .setURL('https://discord.gg/seu_link_do_servidor') // Opcional: Adicione o link do seu servidor aqui
        .setDescription(
            `**Bem-vindo ao Void, viajante.**\n\nPara navegar neste espaço de caos e ordem, siga as diretrizes abaixo. A desobediência atrai a fúria do Vazio. Leia atentamente para garantir sua permanência.`
        )
        .setImage(RULES_BANNER_URL) // Banner no topo
        .setThumbnail(interaction.guild.iconURL({ dynamic: true })) // Ícone do servidor como thumbnail
        .addFields(rulesContent)

        .setTimestamp();

    try {
        // 3. Envio da Mensagem
        await channel.send({ embeds: [rulesEmbed] });

        // 4. Resposta ao Comando
        await interaction.reply({ 
            content: `✅ O Código do Vazio foi enviado com sucesso para o canal ${channel}! **Lembre-se de substituir o link da imagem do banner no código!**`, 
            ephemeral: true 
        });
    } catch (error) {
        console.error('Erro ao enviar o embed de regras:', error);
        await interaction.reply({ 
            content: `❌ Ocorreu um erro ao tentar enviar o embed de regras no canal ${channel}. Verifique se o bot tem permissão de \`Enviar Mensagens\` e \`Embed Links\` neste canal.`, 
            ephemeral: true 
        });
    }
}

// === HANDLERS DE COMANDOS DE ECONOMIA ===
	
	async function handleSetEconomyLeaderboard(interaction) {
	    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
	        return interaction.reply({ content: "Você não tem permissão para usar este comando.", ephemeral: true });
	    }
	
	    const channel = interaction.options.getChannel('channel');
	
	    if (!channel.isTextBased()) {
	        return interaction.reply({ content: "O canal deve ser um canal de texto.", ephemeral: true });
	    }
	
	    try {
	        await interaction.deferReply({ ephemeral: true });
	        
	        // Envia a mensagem inicial do ranking
	        const embed = await getEconomyLeaderboardEmbed();
	        const message = await channel.send({ embeds: [embed] });
	
	        // Salva a configuração
	        economyLeaderboardConfig[interaction.guildId] = {
	            channelId: channel.id,
	            messageId: message.id
	        };
	        saveEconomyLeaderboardConfig();
	
	        await interaction.editReply({ content: `✅ Ranking Global de Economia configurado com sucesso no canal ${channel}.` });
	    } catch (error) {
	        console.error("Erro ao configurar leaderboard de economia:", error);
	        await interaction.editReply({ content: "❌ Ocorreu um erro ao configurar o Ranking Global de Economia. Verifique se o bot tem permissão para enviar mensagens e embeds no canal." });
	    }
	}
	
	async function handleDaily(interaction) {
	    const userId = interaction.user.id;
	    const user = getUser(userId, interaction.user.tag);
	    const now = Date.now();
	    const oneDay = 24 * 60 * 60 * 1000;
	    
	    if (now - user.lastDaily < oneDay) {
	        const remainingTime = user.lastDaily + oneDay - now;
	        const hours = Math.floor(remainingTime / (1000 * 60 * 60));
	        const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
	        const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);
	        
	        const embed = new EmbedBuilder().setColor("#000000")
	            .setColor("#000000")
	            .setTitle("⏳ Resgate Diário")
	            .setDescription(`Você já resgatou sua recompensa diária!\nVolte em **${hours}h ${minutes}m ${seconds}s** para resgatar novamente.`);
	            
	        return interaction.reply({ embeds: [embed] });
	    }
	
	    const dailyAmount = Math.floor(Math.random() * 500) + 1000; // Entre $1000 e $1500
	    
	    user.bank += dailyAmount;
	    user.lastDaily = now;
	    updateUser(userId, user);
	    
	    const embed = new EmbedBuilder().setColor("#000000")
	        .setColor("#000000")
	        .setTitle("🎉 Resgate Diário Concluído!")
	    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
	        .setDescription(`Você resgatou **${formatDollars(dailyAmount)}** e depositou no seu banco.\n\nSeu saldo bancário atual é de **${formatDollars(user.bank)}**.`);
	        
	    return interaction.reply({ embeds: [embed] });
	}
	
	async function handleBalance(interaction) {
	    const userId = interaction.user.id;
	    const user = getUser(userId, interaction.user.tag);
	    
	    const embed = new EmbedBuilder().setColor("#000000")
	        .setColor("#000000")
	        .setTitle(`Carteira de ${interaction.user.tag}`)
	    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
	        .addFields(
	            { name: '💰 Carteira (Wallet)', value: formatDollars(user.wallet), inline: true },
	            { name: '🏦 Banco (Bank)', value: formatDollars(user.bank), inline: true }
	        )
	        .setFooter({ text: "Use /daily para resgatar dólares diariamente." })
	        .setTimestamp();
	        
	    return interaction.reply({ embeds: [embed] });
	}
	
	async function handleTransfer(interaction) {
	    const senderId = interaction.user.id;
	    const receiver = interaction.options.getUser('user');
	    const amount = interaction.options.getNumber('amount');
	
	    if (amount <= 0 || !Number.isInteger(amount)) {
	        return interaction.reply({ content: "A quantia a ser transferida deve ser um número inteiro positivo.", ephemeral: true });
	    }
	    
	    const sender = getUser(senderId, interaction.user.tag);
	    const receiverUser = getUser(receiver.id, receiver.tag);
	
	    if (sender.bank < amount) {
	        return interaction.reply({ content: `Você não tem ${formatDollars(amount)} no banco para transferir.`, ephemeral: true });
	    }
	
	    sender.bank -= amount;
	    receiverUser.bank += amount;
	    updateUser(senderId, sender);
	    updateUser(receiver.id, receiverUser);
	
	    const embed = new EmbedBuilder().setColor("#000000")
	        .setColor("#000000")
	        .setTitle("💸 Transferência Concluída")
	        .setDescription(`Você transferiu **${formatDollars(amount)}** do seu banco para ${receiver}.`)
	        .addFields(
	            { name: 'Seu Novo Saldo Bancário', value: formatDollars(sender.bank), inline: true },
	            { name: 'Saldo Bancário do Destinatário', value: formatDollars(receiverUser.bank), inline: true }
	        );
	        
	    return interaction.reply({ embeds: [embed] });
	}
	
	async function handleCrash(interaction) {
	    const userId = interaction.user.id;
	    const user = getUser(userId, interaction.user.tag);
	    const bet = interaction.options.getNumber('bet');
	
	    if (bet <= 0 || !Number.isInteger(bet)) {
	        return interaction.reply({ content: "A aposta deve ser um número inteiro positivo.", ephemeral: true });
	    }
	
	    if (user.wallet < bet) {
	        return interaction.reply({ content: `Você não tem ${formatDollars(bet)} na carteira para apostar.`, ephemeral: true });
	    }
	
	    const now = Date.now();
	    const cooldownTime = 10000; // 10 segundos de cooldown
	
	    if (now - user.lastCrash < cooldownTime) {
	        const remainingTime = user.lastCrash + cooldownTime - now;
	        const seconds = Math.ceil(remainingTime / 1000);
	        return interaction.reply({ content: `Você deve esperar ${seconds} segundos antes de jogar Crash novamente.`, ephemeral: true });
	    }
	
	    user.wallet -= bet;
	    user.lastCrash = now;
	    updateUser(userId, user);
	
	    const crashPoint = Math.random() < 0.05 ? 1.00 : (Math.random() * 10) + 1.01; // 5% de chance de crash instantâneo
	    let hasCashedOut = false;
	
	    const embed = new EmbedBuilder().setColor("#000000")
	        .setColor("#000000")
	        .setTitle("🚀 CRASH - O Foguete está Subindo!")
	        .setDescription(`Aposta: **${formatDollars(bet)}**\nMultiplicador Atual: **1.00x**\n\nClique em "Cash Out" para sacar seus ganhos!`);
	
	    const cashOutButton = new ButtonBuilder()
	        .setCustomId('crash_cashout')
	        .setLabel('Cash Out (1.00x)')
	        .setStyle(ButtonStyle.Success);
	
	    const message = await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(cashOutButton)], fetchReply: true });
	
	    const filter = i => i.customId === 'crash_cashout' && i.user.id === userId;
	    const collector = message.createMessageComponentCollector({ filter, time: 60000 });
	
	    let multiplier = 1.00;
	    const interval = setInterval(() => {
	        if (hasCashedOut) return clearInterval(interval);
	
	        multiplier += 0.5;
	        
	        if (multiplier >= crashPoint) {
	            clearInterval(interval);
	            if (!hasCashedOut) {
	                const resultEmbed = new EmbedBuilder().setColor("#000000")
	                    .setColor("#000000")
	                    .setTitle("💥 CRASH!")
	                    .setDescription(`Você perdeu **${formatDollars(bet)}**.\n\nO foguete explodiu em **${crashPoint.toFixed(2)}x**!`);
	                    
	                cashOutButton.setDisabled(true).setLabel('Explodiu!');
	                message.edit({ embeds: [resultEmbed], components: [new ActionRowBuilder().addComponents(cashOutButton)] }).catch(() => {});
	            }
	            collector.stop('crash');
	            return;
	        }
	
	        embed.setDescription(`Aposta: **${formatDollars(bet)}**\nMultiplicador Atual: **${multiplier.toFixed(2)}x**\n\nClique em "Cash Out" para sacar seus ganhos!`);
	        cashOutButton.setLabel(`Cash Out (${multiplier.toFixed(2)}x)`);
	        message.edit({ embeds: [embed], components: [new ActionRowBuilder().addComponents(cashOutButton)] }).catch(() => {});
	    }, 500);
	
	    collector.on('collect', async i => {
	        if (hasCashedOut) return i.reply({ content: "Você já sacou!", ephemeral: true });
	        hasCashedOut = true;
	        clearInterval(interval);
	
	        const winnings = Math.floor(bet * multiplier);
	        const profit = winnings - bet;
	        user.wallet += winnings;
	        updateUser(userId, user);
	
	        const resultEmbed = new EmbedBuilder().setColor("#000000")
	            .setColor("#000000")
	            .setTitle("✅ CASH OUT!")
	            .setDescription(`Você sacou em **${multiplier.toFixed(2)}x** e ganhou **${formatDollars(winnings)}** (Lucro: ${formatDollars(profit)}).\n\nSeu novo saldo na carteira é de **${formatDollars(user.wallet)}**.`);
	            
	        cashOutButton.setDisabled(true).setLabel(`Sacou em ${multiplier.toFixed(2)}x`);
	        i.update({ embeds: [resultEmbed], components: [new ActionRowBuilder().addComponents(cashOutButton)] });
	        collector.stop('cashout');
	    });
	
	    collector.on('end', (collected, reason) => {
	        if (reason === 'time') {
	            if (!hasCashedOut) {
	                const resultEmbed = new EmbedBuilder().setColor("#000000")
	                    .setColor("#000000")
	                    .setTitle("💥 CRASH!")
	                    .setDescription(`Você perdeu **${formatDollars(bet)}**.\n\nO tempo acabou e o foguete explodiu em **${crashPoint.toFixed(2)}x**!`);
	                    
	                cashOutButton.setDisabled(true).setLabel('Explodiu!');
	                message.edit({ embeds: [resultEmbed], components: [new ActionRowBuilder().addComponents(cashOutButton)] }).catch(() => {});
	            }
	        } else if (reason === 'crash' && !hasCashedOut) {
	            // Lida com o crash se não tiver feito cash out antes
	            const resultEmbed = new EmbedBuilder().setColor("#000000")
	                .setColor("#000000")
	                .setTitle("💥 CRASH!")
	                .setDescription(`Você perdeu **${formatDollars(bet)}**.\n\nO foguete explodiu em **${crashPoint.toFixed(2)}x**!`);
	                
	            cashOutButton.setDisabled(true).setLabel('Explodiu!');
	            message.edit({ embeds: [resultEmbed], components: [new ActionRowBuilder().addComponents(cashOutButton)] }).catch(() => {});
	        }
	    });
	}
async function sendLog(guild, embed) { const config = logConfig[guild.id]; if (!config?.channelId) return; try { const channel = await guild.channels.fetch(config.channelId); if (channel?.isTextBased()) await channel.send({ embeds: [embed] }); } catch (e) {} }
function getLevel(currentXP) { let level = 0; for (let i = 0; i < LEVELS.length; i++) { if (currentXP >= LEVELS[i]) level = i + 1; else break; } return level; }
async function updateRankingRoles(guild) {
    const config = rankingRolesConfig[guild.id];
    if (!config || !config.roleId1 || !config.roleId2 || !config.roleId3) return;

    const guildXP = xp[guild.id] || {};
    const sortedXP = Object.entries(guildXP)
        .sort(([, xpA], [, xpB]) => xpB - xpA)
        .slice(0, 3); // Pega o Top 3

    const topUsers = sortedXP.map(([userId]) => userId);
    const roleIds = [config.roleId1, config.roleId2, config.roleId3];
    const currentTopUsers = config.currentTopUsers || {};

    for (let i = 0; i < 3; i++) {
        const position = i + 1;
        const roleId = roleIds[i];
        const newTopUserId = topUsers[i];
        const oldTopUserId = currentTopUsers[position];

        // 1. Remover o cargo do usuário anterior (se existir e não for o novo Top)
        if (oldTopUserId && oldTopUserId !== newTopUserId) {
            try {
                const oldMember = await guild.members.fetch(oldTopUserId).catch(() => null);
                if (oldMember) {
                    await oldMember.roles.remove(roleId, `Perdeu a posição #${position} no ranking de XP.`);
                    console.log(`[RankingRoles] Cargo #${position} removido de ${oldMember.user.tag}.`);
                }
            } catch (e) {
                console.error(`[RankingRoles] Erro ao remover cargo #${position} de ${oldTopUserId}:`, e);
            }
        }

        // 2. Atribuir o cargo ao novo usuário Top (se existir e não for o usuário anterior)
        if (newTopUserId && newTopUserId !== oldTopUserId) {
            try {
                const newMember = await guild.members.fetch(newTopUserId).catch(() => null);
                if (newMember) {
                    await newMember.roles.add(roleId, `Alcançou a posição #${position} no ranking de XP.`);
                    console.log(`[RankingRoles] Cargo #${position} atribuído a ${newMember.user.tag}.`);
                }
            } catch (e) {
                console.error(`[RankingRoles] Erro ao atribuir cargo #${position} a ${newTopUserId}:`, e);
            }
        }

        // 3. Atualizar o registro do Top 3
        if (newTopUserId) {
            currentTopUsers[position] = newTopUserId;
        } else {
            delete currentTopUsers[position];
        }
    }

    // Salvar a nova configuração de Top Users
    config.currentTopUsers = currentTopUsers;
    saveRankingRolesConfig();
}

async function getLeaderboardEmbed(guild) { const guildXP = xp[guild.id] || {}; const sortedXP = Object.entries(guildXP).sort(([, xpA], [, xpB]) => xpB - xpA).slice(0, 10); let leaderboardText = "Ninguém ainda ganhou XP neste servidor."; if (sortedXP.length > 0) { leaderboardText = sortedXP.map(([userId, userXP], index) => `**#${index + 1}** <@${userId}> - Nível ${getLevel(userXP)} (${userXP} XP)`).join('\n'); } return new EmbedBuilder().setColor("#000000").setTitle(`🏆 Top 10 Ranking de XP - ${guild.name}`).setDescription(leaderboardText).setColor("#000000").setFooter({ text: "Atualizado a cada 30 segundos." }).setTimestamp(); }
async function updateAllLeaderboards() { 
		    // Atualiza os Cargos de Ranking (novo)
		    for (const guildId in rankingRolesConfig) {
		        const guild = client.guilds.cache.get(guildId);
		        if (guild) {
		            await updateRankingRoles(guild);
		        }
		    }

		    // Atualiza o Leaderboard de XP (existente)
		    for (const guildId in leaderboardConfig) { 
		        const config = leaderboardConfig[guildId]; 
		        const guild = client.guilds.cache.get(guildId); 
		        if (!guild) { 
		            delete leaderboardConfig[guildId]; 
		            saveLeaderboardConfig(); 
		            continue; 
		        } 
		        try { 
		            const channel = await guild.channels.fetch(config.channelId); 
		            const message = await channel.messages.fetch(config.messageId); 
		            await message.edit({ embeds: [await getLeaderboardEmbed(guild)] }); 
		        } catch (e) { 
		            if ([10003, 10008, 10004].includes(e.code)) { 
		                delete leaderboardConfig[guildId]; 
		                saveLeaderboardConfig(); 
		            } 
		        } 
		    } 
		
		    // Atualiza o Leaderboard de Economia (novo)
		    for (const guildId in economyLeaderboardConfig) { 
		        const config = economyLeaderboardConfig[guildId]; 
		        const guild = client.guilds.cache.get(guildId); 
		        if (!guild) { 
		            delete economyLeaderboardConfig[guildId]; 
		            saveEconomyLeaderboardConfig(); 
		            continue; 
		        } 
		        try { 
		            const channel = await guild.channels.fetch(config.channelId); 
		            const message = await channel.messages.fetch(config.messageId); 
		            await message.edit({ embeds: [await getEconomyLeaderboardEmbed()] }); 
		        } catch (e) { 
		            if ([10003, 10008, 10004].includes(e.code)) { 
		                delete economyLeaderboardConfig[guildId]; 
		                saveEconomyLeaderboardConfig(); 
		            } 
		        } 
		    }
		}
function getSupportMessage(guild) { const embed = new EmbedBuilder().setColor("#000000").setTitle(`Olá, Void | .gg/wvoid 💀! Fui adicionado!`).setDescription(`Sou o **VoidSynth**, seu novo bot de gerenciamento e diversão.\n\nUse \`/help\` para ver minhas funcionalidades.\n\n---\n\n✨ **Apoie o Projeto!**\nSe você gosta do meu trabalho, considere apoiar o desenvolvimento para me manter online e com novas funcionalidades.`).setThumbnail(client.user.displayAvatarURL()).setFooter({ text: `Obrigado por me escolher! | ID: ${guild.id}` }).setTimestamp(); const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Seja Apoiador (PIX)').setStyle(ButtonStyle.Link).setURL('https://cdn.discordapp.com/attachments/1418607672529387654/1431647616319356948/image.png?ex=68fe2d3e&is=68fcdbbe&hm=af9da616a2ba10430be9b0e90827d098d2bc18b2197ab7e8b035795018fe7832&'  )); return { embeds: [embed], components: [row] }; }

// === FUNÇÕES AUTOPFP ===
function getThreeRandomImages(files) {
    if (files.length < 3) return files;
    const shuffled = files.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
}

async function runAutoPfp(guildId) {
    const config = autopfpConfig[guildId];
    if (!config || !config.enabled || !config.channelId) return;

    try {
        if (!fs.existsSync(IMAGE_FOLDER)) {
            console.error(`❌ Pasta de imagens não encontrada: ${IMAGE_FOLDER}`);
            return;
        }

        const allFiles = fs.readdirSync(IMAGE_FOLDER).filter(file => /\.(jpe?g|png|gif)$/i.test(file));
        if (allFiles.length === 0) {
            console.warn(`⚠️ Nenhuma imagem encontrada na pasta: ${IMAGE_FOLDER}`);
            return;
        }

        const imagesToSend = getThreeRandomImages(allFiles);
        const channel = await client.channels.fetch(config.channelId).catch(() => null);

        if (channel && channel.isTextBased()) {
            for (const file of imagesToSend) {
                const filePath = path.join(IMAGE_FOLDER, file);
                const attachment = { attachment: filePath, name: file };
                
                const now = new Date();
                const brtTime = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

                const embed = new EmbedBuilder().setColor("#000000")
                    .setImage(`attachment://${file}`) // Referencia o arquivo anexado.
                    .setColor("#000000")
                    .setFooter({ text: `Postado às ${brtTime} (BRT)` });

                await channel.send({ embeds: [embed], files: [attachment] });
            }
            console.log(`✅ [AutoPFP] Enviadas 3 imagens em embeds separados para o canal ${channel.id} no servidor ${guildId}`);
        } else {
            console.error(`❌ [AutoPFP] Canal ${config.channelId} não encontrado ou não é um canal de texto.`);
        }
    } catch (e) {
        console.error(`❌ Erro no loop AutoPFP para o servidor ${guildId}:`, e);
    }
}

function startAutoPfpLoop(guildId) {
    if (autopfpIntervals.has(guildId)) {
        clearInterval(autopfpIntervals.get(guildId));
    }
    
    // Executa imediatamente e depois a cada 30 segundos (30000ms)
    const interval = setInterval(() => runAutoPfp(guildId), 30000);
    autopfpIntervals.set(guildId, interval);
    runAutoPfp(guildId); // Primeira execução imediata
}

function stopAutoPfpLoop(guildId) {
    if (autopfpIntervals.has(guildId)) {
        clearInterval(autopfpIntervals.get(guildId));
        autopfpIntervals.delete(guildId);
        return true;
    }
    return false;
}

function restartAllAutoPfpLoops() {
    for (const guildId in autopfpConfig) {
        const config = autopfpConfig[guildId];
        if (config.enabled) {
            startAutoPfpLoop(guildId);
        }
    }
}

// === EVENTO READY ===
client.on("ready", async () => {
    client.user.setActivity('/help', { type: ActivityType.Listening });
	    // Garante que o arquivo de configuração do leaderboard de economia exista
	    if (!fs.existsSync('./economy_leaderboard_config.json')) {
	        fs.writeFileSync('./economy_leaderboard_config.json', '{}');
	    }
    console.log(`✅ Logado como ${client.user.tag}!`);
    loadAllConfigs();
	    client.user.setActivity('/help', { type: ActivityType.Watching });
	    setInterval(updateAllLeaderboards, 30000);
	    
	    restartAllAutoPfpLoops(); // Adicionado para retomar o loop AutoPFP
	    console.log("✅ Sistemas iniciados.");

   const commands = [
        { name: 'setup-loja', description: 'Envia o painel fixo da loja no canal. (Admin)' },
        { 
            name: 'config-loja', 
            description: 'Configura preços e IDs da loja via formulário. (Admin)',
            options: [
                {
                    name: 'categoria',
                    description: 'Escolha a categoria para editar',
                    type: ApplicationCommandOptionType.String,
                    required: true,
                    choices: [
                        { name: 'Cargos de Prestígio', value: 'roles' },
                        { name: 'Cores de Nome', value: 'colors' },
                        { name: 'Utilitários', value: 'utils' }
                    ]
                }
            ]
        },
        { name: 'help', description: 'Exibe a lista de comandos.' },
        { name: 'ping', description: 'Exibe a latência do bot.' },
        { name: 'rank', description: 'Mostra seu nível e XP atual.' },
        { name: 'leaderboard', description: 'Mostra o canal do ranking de XP.' },
        { name: 'daily', description: 'Resgate sua recompensa diária de dólares.' },
        { name: 'balance', description: 'Mostra seu saldo de Dollars (carteira e banco).' },
        { name: 'ranking', description: 'Mostra o Top 10 Global de Economia.' },
        { name: 'transfer', description: 'Transfere dólares para outro usuário.', options: [{ name: 'user', description: 'O usuário para quem transferir.', type: ApplicationCommandOptionType.User, required: true }, { name: 'amount', description: 'A quantidade de dólares a transferir.', type: ApplicationCommandOptionType.Number, required: true }] },
        { name: 'seteconomyleaderboard', description: 'Configura o ranking global de economia. (Admin)', options: [{ name: 'channel', description: 'O canal de texto.', type: ApplicationCommandOptionType.Channel, required: true }] },
        { name: 'setruleschannel', description: 'Define o canal e envia o Embed de Regras do servidor Void. (Admin)', options: [{ name: 'channel', description: 'O canal de texto onde as regras serão enviadas.', type: ApplicationCommandOptionType.Channel, required: true }] },
        { name: 'setrankingroles', description: 'Configura os cargos para o Top 1, Top 2 e Top 3 do ranking de XP. (Admin)', options: [
            { name: 'top1_role', description: 'O cargo para o Top 1.', type: ApplicationCommandOptionType.Role, required: true },
            { name: 'top2_role', description: 'O cargo para o Top 2.', type: ApplicationCommandOptionType.Role, required: true },
            { name: 'top3_role', description: 'O cargo para o Top 3.', type: ApplicationCommandOptionType.Role, required: true }
        ] },
        { name: 'crash', description: 'Jogue o famoso Crash e tente multiplicar seus dólares.', options: [{ name: 'bet', description: 'A quantidade de dólares a apostar.', type: ApplicationCommandOptionType.Number, required: true }] },
        { name: 'bank', description: 'Abre o menu do banco para depositar e sacar.' },
        { name: 'avatar', description: 'Mostra o avatar de um usuário.', options: [{ name: 'user', description: 'O usuário.', type: ApplicationCommandOptionType.User, required: false }] },
        { name: 'apoiador', description: 'Mostra como apoiar o projeto.' },
        { name: 'clear', description: 'Apaga mensagens. (Admin)', options: [{ name: 'amount', description: 'Número de mensagens (1-100).', type: ApplicationCommandOptionType.Integer, required: true, minValue: 1, maxValue: 100 }] },
        { name: 'setleaderboard', description: 'Configura o ranking de XP. (Admin)', options: [{ name: 'channel', description: 'O canal de texto.', type: ApplicationCommandOptionType.Channel, required: true }] },
        { name: 'setupvoice', description: 'Configura o sistema de voz temporário. (Admin)', options: [{ name: 'channel', description: 'O canal para criar salas.', type: ApplicationCommandOptionType.Channel, required: true }, { name: 'category', description: 'A categoria para as novas salas.', type: ApplicationCommandOptionType.Channel, required: true }] },
        { name: 'vcpanel', description: 'Envia o painel de controle de voz. (Admin)' },
        { name: 'setregister', description: 'Envia a mensagem de registro. (Admin)', options: [{ name: 'channel', description: 'O canal.', type: ApplicationCommandOptionType.Channel, required: true }, { name: 'role', description: 'O cargo a ser concedido.', type: ApplicationCommandOptionType.Role, required: true }, { name: 'gif_url', description: 'URL de uma imagem/GIF (opcional).', type: ApplicationCommandOptionType.String, required: false }] },
        { name: 'setwelcome', description: 'Configura as boas-vindas. (Admin)', options: [{ name: 'channel', description: 'O canal.', type: ApplicationCommandOptionType.Channel, required: true }] },
        { name: 'setlogchannel', description: 'Configura o canal de logs. (Admin)', options: [{ name: 'channel', description: 'O canal.', type: ApplicationCommandOptionType.Channel, required: true }] },
        { name: 'antinuke', description: 'Configura o sistema Antinuke. (Admin)', options: [{ name: 'action', description: 'Ativar ou desativar.', type: ApplicationCommandOptionType.String, required: true, choices: [{ name: 'ativar', value: 'enable' }, { name: 'desativar', value: 'disable' }] }] },
        { name: 'adminpanel', description: 'Envia o painel de moderação temporário. (Admin)', options: [{ name: 'user', description: 'O membro a ser moderado.', type: ApplicationCommandOptionType.User, required: true }] },
        { name: 'autopfp', description: 'Configura o loop de envio de imagens automáticas (AutoPFP). (Admin)', options: [
            { name: 'action', description: 'Ação a ser executada.', type: ApplicationCommandOptionType.String, required: true, choices: [{ name: 'start', value: 'start' }, { name: 'stop', value: 'stop' }] },
            { name: 'channel', description: 'O canal de texto para o AutoPFP (apenas para "start").', type: ApplicationCommandOptionType.Channel, required: false }
        ] },
        { name: 'joinvc', description: 'Conecta o bot ao seu canal de voz e o mantém lá por 24 horas.' },
        { name: 'xplog', description: 'Ativa/Desativa os logs de XP em tempo real. (Admin)', options: [{ name: 'status', description: 'Ativar ou Desativar', type: ApplicationCommandOptionType.String, required: true, choices: [{ name: 'Ativar', value: 'on' }, { name: 'Desativar', value: 'off' }] }, { name: 'canal', description: 'Canal para enviar os logs', type: ApplicationCommandOptionType.Channel, required: false }] },
    ];

    try {
        await new REST({ version: '10' }).setToken(process.env.TOKEN).put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Comandos de aplicação (/) registrados com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao registrar comandos:', error);
    }

// === EVENTOS DE INTERAÇÃO ===
client.on('interactionCreate', async interaction => {

    // === 1. COMANDO PARA ENVIAR O PAINEL FIXO DA LOJA (ADMIN) ===
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup-loja') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "❌ Apenas administradores podem usar este comando.", ephemeral: true });
        }

        const embedLoja = new EmbedBuilder()
            .setTitle("🌌 MERCADO DO VAZIO")
            .setColor("#000000")
            .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
            .setDescription("Bem-vindo ao centro comercial do Void. Use seus Dollars para adquirir prestígio.\n\n**Categorias:**\n👑 `Cargos` - Títulos exclusivos.\n🎨 `Cores` - Cores para seu nome.\n⚙️ `Extras` - Vantagens diversas.\n\n*Clique nos botões abaixo para comprar.*")
            .setImage("https://i.imgur.com/i9pD7fH.gif") 
            .setFooter({ text: "Void Synth • O Vazio nunca dorme.", iconURL: client.user.displayAvatarURL() });

        const botoes = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('shop_cat_roles').setLabel('Cargos').setStyle(ButtonStyle.Primary).setEmoji('👑'),
            new ButtonBuilder().setCustomId('shop_cat_colors').setLabel('Cores').setStyle(ButtonStyle.Success).setEmoji('🎨'),
            new ButtonBuilder().setCustomId('shop_cat_utils').setLabel('Utilitários').setStyle(ButtonStyle.Secondary).setEmoji('⚙️')
        );

        await interaction.channel.send({ embeds: [embedLoja], components: [botoes] });
        return interaction.reply({ content: "✅ Painel da loja enviado!", ephemeral: true });
    }

    // === 2. COMANDO DE CONFIGURAÇÃO VIA CHAT (MODAL/FORMULÁRIO) ===
    if (interaction.isChatInputCommand() && interaction.commandName === 'config-loja') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
        }

        const cat = interaction.options.getString('categoria');
        const modal = new ModalBuilder()
            .setCustomId(`modal_config_${cat}`)
            .setTitle(`Configurar ${cat}`);

        if (cat === 'roles') {
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id_viajante').setLabel('ID Viajante do Caos').setStyle(TextInputStyle.Short).setValue(DATA_LOJA.viajante.id || '').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id_sombra').setLabel('ID Sombra Eterna').setStyle(TextInputStyle.Short).setValue(DATA_LOJA.sombra.id || '').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id_lorde').setLabel('ID Lorde do Vazio').setStyle(TextInputStyle.Short).setValue(DATA_LOJA.lorde.id || '').setRequired(true))
            );
        } else if (cat === 'colors') {
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id_rubi').setLabel('ID Cargo Cor Rubi').setStyle(TextInputStyle.Short).setValue(DATA_LOJA.rubi.id || '').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id_safira').setLabel('ID Cargo Cor Safira').setStyle(TextInputStyle.Short).setValue(DATA_LOJA.safira.id || '').setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id_esmeralda').setLabel('ID Cargo Cor Esmeralda').setStyle(TextInputStyle.Short).setValue(DATA_LOJA.esmeralda.id || '').setRequired(true))
            );
        } else if (cat === 'utils') {
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id_vip').setLabel('ID Cargo VIP').setStyle(TextInputStyle.Short).setValue(DATA_LOJA.vip.id || '').setRequired(true))
            );
        }

        return await interaction.showModal(modal);
    }

    // === 3. SALVAR DADOS DO FORMULÁRIO ===
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_config_roles') {
            DATA_LOJA.viajante.id = interaction.fields.getTextInputValue('id_viajante');
            DATA_LOJA.sombra.id = interaction.fields.getTextInputValue('id_sombra');
            DATA_LOJA.lorde.id = interaction.fields.getTextInputValue('id_lorde');
        } else if (interaction.customId === 'modal_config_colors') {
            DATA_LOJA.rubi.id = interaction.fields.getTextInputValue('id_rubi');
            DATA_LOJA.safira.id = interaction.fields.getTextInputValue('id_safira');
            DATA_LOJA.esmeralda.id = interaction.fields.getTextInputValue('id_esmeralda');
        } else if (interaction.customId === 'modal_config_utils') {
            DATA_LOJA.vip.id = interaction.fields.getTextInputValue('id_vip');
        }
        
        salvarLoja(); // Salva no arquivo .json
        return interaction.reply({ content: "✅ Configurações da loja atualizadas com sucesso!", ephemeral: true });
    }

    // === 4. LÓGICA DOS BOTÕES DA LOJA ===
    if (interaction.isButton() && interaction.customId.startsWith('shop_cat_')) {
        const categoria = interaction.customId;
        const user = getUser(interaction.user.id, interaction.user.tag);
        const menu = new StringSelectMenuBuilder().setCustomId('executar_compra').setPlaceholder('Escolha o item...');

        if (categoria === 'shop_cat_roles') {
            menu.addOptions([
                { label: 'Viajante do Caos', value: 'viajante', description: `Preço: ${formatDollars(DATA_LOJA.viajante.preco)}` },
                { label: 'Sombra Eterna', value: 'sombra', description: `Preço: ${formatDollars(DATA_LOJA.sombra.preco)}` },
                { label: 'Lorde do Vazio', value: 'lorde', description: `Preço: ${formatDollars(DATA_LOJA.lorde.preco)}` }
            ]);
        } else if (categoria === 'shop_cat_colors') {
            menu.addOptions([
                { label: 'Cor: Rubi', value: 'rubi', description: `Preço: ${formatDollars(DATA_LOJA.rubi.preco)}` },
                { label: 'Cor: Safira', value: 'safira', description: `Preço: ${formatDollars(DATA_LOJA.safira.preco)}` },
                { label: 'Cor: Esmeralda', value: 'esmeralda', description: `Preço: ${formatDollars(DATA_LOJA.esmeralda.preco)}` }
            ]);
        } else if (categoria === 'shop_cat_utils') {
            menu.addOptions([
                { label: 'Tag VIP (30 dias)', value: 'vip', description: `Preço: ${formatDollars(DATA_LOJA.vip.preco)}` }
            ]);
        }

        const row = new ActionRowBuilder().addComponents(menu);
        return interaction.reply({ 
            content: `💰 Seu Saldo no Banco: \`${formatDollars(user.bank)}\``, 
            components: [row], 
            ephemeral: true 
        });
    }

    // === 5. PROCESSAMENTO FINAL DA COMPRA ===
    if (interaction.isStringSelectMenu() && interaction.customId === 'executar_compra') {
        const itemChave = interaction.values[0];
        const itemDados = DATA_LOJA[itemChave];
        const user = getUser(interaction.user.id, interaction.user.tag);

        if (!itemDados.id) {
            return interaction.reply({ content: "❌ O Admin ainda não configurou o ID deste cargo via /config-loja.", ephemeral: true });
        }

        if (user.bank < itemDados.preco) {
            return interaction.reply({ content: `❌ Saldo insuficiente no banco!`, ephemeral: true });
        }

        const role = interaction.guild.roles.cache.get(itemDados.id);
        if (!role) return interaction.reply({ content: "❌ Cargo não encontrado no servidor. Verifique o ID configurado.", ephemeral: true });

        if (interaction.member.roles.cache.has(itemDados.id)) {
            return interaction.reply({ content: "❌ Você já possui este item!", ephemeral: true });
        }

        user.bank -= itemDados.preco;
        updateUser(interaction.user.id, user);
        await interaction.member.roles.add(role);

        return interaction.reply({ content: `✅ Compra realizada! Você recebeu o cargo **${role.name}**.`, ephemeral: true });
    }

    // === 4. MODAL DE DEPÓSITO E SAQUE DO BANCO ===
    if (interaction.isModalSubmit()) {
        const userId = interaction.user.id;
        const user = getUser(userId, interaction.user.tag);

		        if (interaction.customId === 'modal_deposit') {
		            await interaction.deferReply({ ephemeral: true });
		            const amountStr = interaction.fields.getTextInputValue('deposit_amount').toLowerCase();
		            let amount = amountStr === 'all' ? user.wallet : parseInt(amountStr.replace(/[,.]/g, ''));

		            if (isNaN(amount) || amount <= 0) {
		                return interaction.editReply({ content: 'Por favor, insira um número válido ou "all".' });
		            }
		            if (amount > user.wallet) {
		                return interaction.editReply({ content: `Você não tem ${formatDollars(amount)} para depositar.` });
		            }

		            user.wallet -= amount;
		            user.bank += amount;
		            updateUser(userId, user);

		            const embed = new EmbedBuilder().setColor("#000000")
		                .setColor("#000000")
		                .setTitle("✅ Depósito Realizado")
		        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
		                .setDescription(`Você depositou **${formatDollars(amount)}** no seu banco.`)
		                .addFields(
		                    { name: '💰 Carteira', value: formatDollars(user.wallet), inline: true },
		                    { name: '🏦 Banco', value: formatDollars(user.bank), inline: true }
		                );
		            await interaction.deleteReply(); // Remove a resposta temporária de carregamento
		            await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed] }); // Envia a mensagem pública
		            
		            // Adiciona XP após interação bem-sucedida
		            await addXP(interaction.guild, interaction.user, interaction.channel);
		            
		            return;
		        }

		        if (interaction.customId === 'modal_withdraw') {
		            await interaction.deferReply({ ephemeral: true });
		            const amountStr = interaction.fields.getTextInputValue('withdraw_amount').toLowerCase();
		            let amount = amountStr === 'all' ? user.bank : parseInt(amountStr.replace(/[,.]/g, ''));

		            if (isNaN(amount) || amount <= 0) {
		                return interaction.editReply({ content: 'Por favor, insira um número válido ou "all".' });
		            }
		            if (amount > user.bank) {
		                return interaction.editReply({ content: `Você não tem ${formatDollars(amount)} para sacar.` });
		            }

		            user.bank -= amount;
		            user.wallet += amount;
		            updateUser(userId, user);

		            const embed = new EmbedBuilder().setColor("#000000")
		                .setColor("#000000")
		                .setTitle("✅ Saque Realizado")
		        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
		                .setDescription(`Você sacou **${formatDollars(amount)}** do seu banco.`)
		                .addFields(
		                    { name: '💰 Carteira', value: formatDollars(user.wallet), inline: true },
		                    { name: '🏦 Banco', value: formatDollars(user.bank), inline: true }
		                );
		            await interaction.deleteReply(); // Remove a resposta temporária de carregamento
		            await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed] }); // Envia a mensagem pública
		            
		            // Adiciona XP após interação bem-sucedida
		            await addXP(interaction.guild, interaction.user, interaction.channel);
		            
		            return;
		        }
	    }
	    if (interaction.isButton()) {
	        if (interaction.customId === 'bank_deposit') {
	            return handleDeposit(interaction);
	        }
	        if (interaction.customId === 'bank_withdraw') {
	            return handleWithdraw(interaction);
	        }
		        const [action] = interaction.customId.split('_');
			
				        // Permite que o botão 'crash_cashout' execute sem a verificação de canal de voz.
				        // A lógica de tratamento é feita pelo MessageComponentCollector no comando /crash.
				        if (interaction.customId === 'crash_cashout') {
				            return;
				        }
		        const reply = (c, e = true) => interaction.reply({ content: c, ephemeral: e });

		        // Lógica de moderação
		        if (action.startsWith('mod')) {
		            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return reply("❌ Você precisa ser administrador para usar este painel.");
		            
		            const [_, targetId] = interaction.customId.split('_');
		            const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

		            if (!targetMember) return reply("❌ O membro não está mais no servidor.");
		            if (targetMember.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) return reply("❌ Você não pode moderar alguém com cargo igual ou superior ao seu.");
		            if (!targetMember.manageable) return reply("❌ Não tenho permissão para moderar este membro (cargo muito alto).");

		            switch(action) {
			                case 'modKick': {
			                    const modal = new ModalBuilder().setCustomId(`modalKick_${targetMember.id}`).setTitle('Expulsar Membro').addComponents(
			                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('kickReason').setLabel('Motivo da Expulsão').setStyle(TextInputStyle.Paragraph).setRequired(true))
			                    );
			                    return interaction.showModal(modal);
			                }
			                case 'modBan': {
			                    const modal = new ModalBuilder().setCustomId(`modalBan_${targetMember.id}`).setTitle('Banir Membro').addComponents(
			                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banReason').setLabel('Motivo do Banimento').setStyle(TextInputStyle.Paragraph).setRequired(true))
			                    );
			                    return interaction.showModal(modal);
			                }
		                case 'modTimeout': {
		                    const modal = new ModalBuilder().setCustomId(`modalTimeout_${targetMember.id}`).setTitle('Aplicar Castigo (Timeout)').addComponents(
		                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('timeoutDuration').setLabel('Duração (em minutos)').setStyle(TextInputStyle.Short).setRequired(true)),
		                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('timeoutReason').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(false))
		                    );
		                    return interaction.showModal(modal);
		                }
			                case 'modMute': {
			                    if (!targetMember.voice.channel) return reply("❌ O membro não está em um canal de voz.");
			                    const modal = new ModalBuilder().setCustomId(`modalMute_${targetMember.id}`).setTitle('Mutar Membro').addComponents(
			                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('muteReason').setLabel('Motivo do Mute').setStyle(TextInputStyle.Paragraph).setRequired(true))
			                    );
			                    return interaction.showModal(modal);
			                }
		            }
		            return;
		        }
		        // Fim da lógica de moderação
		
		        if (action === 'register') {
			            const [_, roleId] = interaction.customId.split('_');
			            const role = interaction.guild.roles.cache.get(roleId);
	            if (!role) return reply("❌ Cargo não encontrado.");
	            if (interaction.member.roles.cache.has(role.id)) return reply("✅ Você já tem este cargo!");
	            await interaction.member.roles.add(role).then(() => reply(`✅ Cargo **${role.name}** concedido!`)).catch(() => reply("❌ Erro ao dar o cargo."));
	            return;
	        }
	
		        // Lógica dos botões de Voz Temporária
		        if (action.startsWith('vc')) {
		            const userChannel = interaction.member.voice.channel;
		            if (!userChannel || !tempVcOwners.has(userChannel.id)) return reply("❌ Você precisa estar em um canal de voz temporário para usar isto.");
	
		            const isOwner = tempVcOwners.get(userChannel.id) === interaction.member.id;
	
		            switch(action) {
	            case 'vcRename': {
	                if (!isOwner) return reply("❌ Apenas o dono do canal pode renomeá-lo.");
	                const modal = new ModalBuilder().setCustomId(`modalRename_${userChannel.id}`).setTitle('Renomear Canal').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('newNameInput').setLabel('Novo nome').setStyle(TextInputStyle.Short).setRequired(true)));
	                return interaction.showModal(modal);
	            }
	            case 'vcLimit': {
	                if (!isOwner) return reply("❌ Apenas o dono do canal pode alterar o limite.");
	                const modal = new ModalBuilder().setCustomId(`modalLimit_${userChannel.id}`).setTitle('Definir Limite').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('newLimitInput').setLabel('Novo limite (0 para ilimitado)').setStyle(TextInputStyle.Short).setRequired(true).setValue(userChannel.userLimit.toString())));
	                return interaction.showModal(modal);
	            }
	            case 'vcKick': {
	                if (!isOwner) return reply("❌ Apenas o dono do canal pode expulsar membros.");
	                const members = userChannel.members.filter(m => m.id !== interaction.member.id);
	                if (members.size === 0) return reply("❌ Não há outros membros para expulsar.");
	                const menu = new StringSelectMenuBuilder().setCustomId(`kickMenu_${userChannel.id}`).setPlaceholder('Selecione um membro para expulsar').addOptions(members.map(m => ({ label: m.user.username, value: m.id })));
	                return interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
	            }
	            case 'vcLock': if (isOwner) { await userChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: false }); return reply("🔒 Canal trancado."); } else return reply("❌ Apenas o dono pode trancar.");
	            case 'vcUnlock': if (isOwner) { await userChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: true }); return reply("🔓 Canal destrancado."); } else return reply("❌ Apenas o dono pode destrancar.");
	            case 'vcHide': if (isOwner) { await userChannel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false }); return reply("👁️ Canal ocultado."); } else return reply("❌ Apenas o dono pode ocultar.");
	            case 'vcReveal': if (isOwner) { await userChannel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true }); return reply("📢 Canal revelado."); } else return reply("❌ Apenas o dono pode revelar.");
	            case 'vcClaim': {
	                const ownerId = tempVcOwners.get(userChannel.id);
	                const owner = interaction.guild.members.cache.get(ownerId);
	                if (owner && owner.voice.channelId === userChannel.id) return reply("❌ O dono ainda está no canal.");
	                tempVcOwners.set(userChannel.id, interaction.member.id);
	                await userChannel.permissionOverwrites.edit(interaction.member.id, { ManageChannels: true });
	                return reply("👑 Você reivindicou a posse do canal!");
	            }
	            case 'vcIncrease': if (isOwner) { const newLimit = Math.min(userChannel.userLimit + 1, 99); await userChannel.setUserLimit(newLimit); return reply(`➕ Limite aumentado para ${newLimit}.`); } else return reply("❌ Apenas o dono pode aumentar o limite.");
	            case 'vcDecrease': if (isOwner) { const newLimit = Math.max(userChannel.userLimit - 1, 0); await userChannel.setUserLimit(newLimit); return reply(`➖ Limite diminuído para ${newLimit}.`); } else return reply("❌ Apenas o dono pode diminuir o limite.");
		            case 'vcDelete': if (isOwner) { await userChannel.delete("Deletado pelo dono."); return reply("🗑️ Canal deletado."); } else return reply("❌ Apenas o dono pode deletar o canal.");
	
		            }
		            return;
		        }
		    }
	
	    if (interaction.isStringSelectMenu()) {
	        const [action, targetId] = interaction.customId.split('_');
	        if (action === 'kickMenu') {
	            const userToKickId = interaction.values[0];
	            const memberToKick = await interaction.guild.members.fetch(userToKickId);
	            if (memberToKick) {
	                await memberToKick.voice.disconnect("Expulso pelo dono do canal.");
	                return interaction.update({ content: `✅ ${memberToKick.user.username} foi expulso do canal.`, components: [] });
	            }
	        }
	        return;
	    }
	
		    if (interaction.isModalSubmit()) { 
		        const [action, targetId] = interaction.customId.split('_'); 
		        
			        if (action === 'modalKick') {
			            const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
			            if (!targetMember) return interaction.reply({ content: "❌ O membro não está mais no servidor.", ephemeral: true });
			            const reason = interaction.fields.getTextInputValue('kickReason') || 'Sem motivo especificado.';
			            try {
			                await targetMember.kick(reason);
			                return interaction.reply({ content: `✅ Membro **${targetMember.user.tag}** expulso. Motivo: ${reason}`, ephemeral: true });
			            } catch (e) {
			                return interaction.reply({ content: "❌ Não foi possível expulsar o membro. Verifique minhas permissões.", ephemeral: true });
			            }
			        }
	
			        if (action === 'modalBan') {
			            const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
			            if (!targetMember) return interaction.reply({ content: "❌ O membro não está mais no servidor.", ephemeral: true });
			            const reason = interaction.fields.getTextInputValue('banReason') || 'Sem motivo especificado.';
			            try {
			                await targetMember.ban({ reason });
			                return interaction.reply({ content: `✅ Membro **${targetMember.user.tag}** banido. Motivo: ${reason}`, ephemeral: true });
			            } catch (e) {
			                return interaction.reply({ content: "❌ Não foi possível banir o membro. Verifique minhas permissões.", ephemeral: true });
			            }
			        }
	
			        if (action === 'modalMute') {
			            const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
			            if (!targetMember) return interaction.reply({ content: "❌ O membro não está mais no servidor.", ephemeral: true });
			            const reason = interaction.fields.getTextInputValue('muteReason') || 'Sem motivo especificado.';
			            if (!targetMember.voice.channel) return interaction.reply({ content: "❌ O membro não está em um canal de voz para ser mutado.", ephemeral: true });
			            try {
			                await targetMember.voice.setMute(true, reason);
			                return interaction.reply({ content: `✅ Membro **${targetMember.user.tag}** mutado no canal de voz. Motivo: ${reason}`, ephemeral: true });
			            } catch (e) {
			                return interaction.reply({ content: "❌ Não foi possível mutar o membro. Verifique minhas permissões.", ephemeral: true });
			            }
			        }
	
			        if (action === 'modalTimeout') {
		            const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
		            if (!targetMember) return interaction.reply({ content: "❌ O membro não está mais no servidor.", ephemeral: true });
		
		            const duration = parseInt(interaction.fields.getTextInputValue('timeoutDuration'));
		            const reason = interaction.fields.getTextInputValue('timeoutReason') || 'Sem motivo especificado.';
		
		            if (isNaN(duration) || duration <= 0) return interaction.reply({ content: "❌ Duração de castigo inválida. Use um número inteiro positivo (em minutos).", ephemeral: true });
		            
		            const durationMs = duration * 60 * 1000;
		            const maxDurationMs = 2419200000; // 28 dias
		            
		            if (durationMs > maxDurationMs) return interaction.reply({ content: "❌ A duração máxima de castigo é de 28 dias.", ephemeral: true });
		
		            try {
		                await targetMember.timeout(durationMs, reason);
		                return interaction.reply({ content: `✅ Membro **${targetMember.user.tag}** castigado por ${duration} minutos. Motivo: ${reason}`, ephemeral: true });
		            } catch (e) {
		                return interaction.reply({ content: "❌ Não foi possível aplicar o castigo. Verifique minhas permissões.", ephemeral: true });
		            }
		        }
		
		        const channel = interaction.guild.channels.cache.get(targetId); 
		        if (!channel) return interaction.reply({ content: "❌ Canal não encontrado.", ephemeral: true }); 
		        
		        if (action === 'modalRename') { 
		            await channel.setName(interaction.fields.getTextInputValue('newNameInput')); 
		            return interaction.reply({ content: `✅ Canal renomeado.`, ephemeral: true }); 
		        } 
		        
		        if (action === 'modalLimit') { 
		            const limit = parseInt(interaction.fields.getTextInputValue('newLimitInput')); 
		            if (isNaN(limit) || limit < 0 || limit > 99) return interaction.reply({ content: "❌ Limite inválido.", ephemeral: true }); 
		            await channel.setUserLimit(limit); 
		            return interaction.reply({ content: `✅ Limite definido para ${limit === 0 ? 'ilimitado' : limit}.`, ephemeral: true }); 
		        } 
		        
		        return; 
		    }
	    if (!interaction.isCommand()) return;
	
	    const { commandName, options } = interaction;
	    const reply = (content, ephemeral = true) => interaction.reply({ content, ephemeral });
	
		    // Comandos que não devem conceder XP (Admin, Configuração, etc.)
			    const noXpCommands = ['setruleschannel', 'seteconomyleaderboard', 'setrankingroles', 'clear', 'setleaderboard', 'setupvoice', 'vcpanel', 'setregister', 'setwelcome', 'setlogchannel', 'antinuke', 'adminpanel', 'autopfp'];
		
		    // Adiciona XP para comandos que não estão na lista de exclusão
		    if (!noXpCommands.includes(commandName)) {
		        await addXP(interaction.guild, interaction.user, interaction.channel);
		    }
		    
		    
			    if (commandName === 'xplog') {
			        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
			            return interaction.reply({ content: "❌ Você precisa ser administrador para usar este comando.", ephemeral: true });
			        }
			        const status = options.getString('status');
			        const channel = options.getChannel('canal') || interaction.channel;
			
			        if (status === 'on') {
			            xpLogEnabled = true;
			            xpLogChannelId = channel.id;
			            await interaction.reply({ content: `✅ Logs de XP ativados no canal ${channel}!`, ephemeral: true });
			        } else {
			            xpLogEnabled = false;
			            await interaction.reply({ content: `❌ Logs de XP desativados!`, ephemeral: true });
			        }
			        return;
			    }
			    if (commandName === 'ping') return reply(`🏓 Latência: ${client.ws.ping}ms`, false);
		    if (commandName === 'rank') { const userXP = xp[interaction.guildId]?.[interaction.user.id] || 0; const embed = new EmbedBuilder().setColor("#000000").setTitle(`📊 Ranking de ${interaction.user.username}`).setDescription(`**XP:** ${userXP}\n**Nível:** ${getLevel(userXP)}`).setColor("#000000"); return interaction.reply({ embeds: [embed], ephemeral: true }); }
		    if (commandName === 'leaderboard') return reply(leaderboardConfig[interaction.guildId]?.channelId ? `O ranking está em <#${leaderboardConfig[interaction.guildId].channelId}>.` : "O ranking não foi configurado.");
		    if (commandName === 'avatar') { const user = options.getUser('user') || interaction.user; const embed = new EmbedBuilder().setColor("#000000").setTitle(`🖼️ Avatar de ${user.tag}`).setImage(user.displayAvatarURL({ dynamic: true, size: 1024 })).setColor("#000000"); return interaction.reply({ embeds: [embed], ephemeral: true }); }
		    
		    // === CORREÇÃO DO /help ===
		    if (commandName === 'help') { 
		        try {
		            const commands = await client.application.commands.fetch();
		            const commandsDescription = commands.map(cmd => `**/${cmd.name}**\n\`${cmd.description}\``).join('\n\n');
		            const embed = new EmbedBuilder().setColor("#000000").setTitle("📚 Lista de Comandos").setColor("#000000").setDescription(commandsDescription);
		            return interaction.reply({ embeds: [embed], ephemeral: true });
		        } catch (error) {
		            console.error("Erro ao buscar comandos para o /help:", error);
		            return reply("❌ Não foi possível carregar os comandos. Tente novamente em segundos.");
		        }
		    }
		    // ==========================
		
			    if (commandName === 'apoiador') return interaction.reply(getSupportMessage(interaction.guild));
			
			    if (commandName === 'joinvc') {
			        await handleJoinVC(interaction);
			        return;
			    }
			
			    // === COMANDOS DE ECONOMIA (PARA TODOS) ===
		    switch (commandName) {
		        case 'daily':
		            await handleDaily(interaction);
		            return;
	        case 'balance':
	            await handleBalance(interaction);
	            return;
	        case 'transfer':
	            await handleTransfer(interaction);
	            return;
	        case 'crash':
	            await handleCrash(interaction);
	            return;
	        case 'ranking':
	            await handleRanking(interaction);
	            return;
	        case 'bank':
	            await handleBank(interaction);
	            return;
	    }
	    // === FIM COMANDOS DE ECONOMIA ===
	
	    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return reply("❌ Você precisa ser administrador para usar este comando.");
	    
		    switch(commandName) {
	        case 'autopfp': {
	            const action = options.getString('action');
	            const channel = options.getChannel('channel');
	
	            if (action === 'start') {
	                if (!channel || !channel.isTextBased()) return reply("❌ Para iniciar, você deve fornecer um canal de texto válido.");
	                
	                // Cria a pasta se não existir (para o usuário colocar as imagens)
	                const folderPath = path.join(process.cwd(), IMAGE_FOLDER); // Caminho absoluto para a pasta
	                if (!fs.existsSync(folderPath)) {
	                    fs.mkdirSync(folderPath);
	                    return reply(`✅ Pasta de imagens **${IMAGE_FOLDER}** criada. Coloque suas imagens lá e execute o comando novamente. (Caminho: \`${folderPath}\`)`);
	                }
	                
	                // Verifica se há imagens
	                const allFiles = fs.readdirSync(folderPath).filter(file => /\.(jpe?g|png|gif)$/i.test(file));
	                if (allFiles.length === 0) return reply(`❌ Nenhuma imagem encontrada na pasta **${IMAGE_FOLDER}**. Adicione imagens e tente novamente.`);
	                
	                // Salva a configuração e inicia o loop
	                autopfpConfig[interaction.guildId] = { enabled: true, channelId: channel.id };
	                saveAutoPfpConfig();
	                startAutoPfpLoop(interaction.guildId);
	                
	                return reply(`✅ AutoPFP iniciado! Enviando 3 imagens aleatórias a cada 30 segundos em ${channel}.`);
	            }
	
	            if (action === 'stop') {
	                if (stopAutoPfpLoop(interaction.guildId)) {
	                    autopfpConfig[interaction.guildId] = { enabled: false, channelId: autopfpConfig[interaction.guildId]?.channelId };
	                    saveAutoPfpConfig();
	                    return reply("✅ AutoPFP parado com sucesso.");
	                } else {
	                    return reply("❌ O AutoPFP não estava ativo neste servidor.");
	                }
	            }
	            return reply("❌ Ação inválida. Use 'start' ou 'stop'.");
	        }
	        case 'clear': await interaction.channel.bulkDelete(options.getInteger('amount'), true).catch(() => {}); return reply(`✅ Mensagens apagadas.`);
	        case 'seteconomyleaderboard':
		                await handleSetEconomyLeaderboard(interaction);
		                break;
		            
				            case 'setruleschannel': {
                                await handleSetRulesChannel(interaction);
                                break;
                            }
				            case 'setrankingroles': {
			                const role1 = options.getRole('top1_role');
			                const role2 = options.getRole('top2_role');
			                const role3 = options.getRole('top3_role');

			                if (!role1 || !role2 || !role3) return reply("❌ Por favor, forneça os 3 cargos (Top 1, Top 2, Top 3).");

			                rankingRolesConfig[interaction.guildId] = {
			                    roleId1: role1.id,
			                    roleId2: role2.id,
			                    roleId3: role3.id,
			                    currentTopUsers: {} // Resetar o registro de usuários atuais
			                };
			                saveRankingRolesConfig();

			                // Tenta aplicar os cargos imediatamente
			                await updateRankingRoles(interaction.guild);

			                return reply(`✅ Cargos de Ranking configurados! Top 1: ${role1}, Top 2: ${role2}, Top 3: ${role3}. Os cargos serão atualizados a cada 30 segundos.`);
			            }
			            case 'setleaderboard': { const channel = options.getChannel('channel'); if (!channel.isTextBased()) return reply("❌ O canal deve ser de texto."); await interaction.deferReply({ ephemeral: true }); try { const message = await channel.send({ embeds: [await getLeaderboardEmbed(interaction.guild)] }); leaderboardConfig[interaction.guildId] = { channelId: channel.id, messageId: message.id }; saveLeaderboardConfig(); return interaction.editReply(`✅ Ranking configurado em ${channel}.`); } catch (e) { return interaction.editReply("❌ Erro. Verifique minhas permissões no canal."); } }
	        case 'setupvoice': { const channel = options.getChannel('channel'); const category = options.getChannel('category'); if (channel.type !== 2) return reply("❌ O canal de criação deve ser de voz."); if (category.type !== 4) return reply("❌ A categoria deve ser uma categoria."); voiceConfig[interaction.guildId] = { categoryId: category.id, createChannelId: channel.id }; saveVoiceConfig(); return reply(`✅ Sistema de voz temporária configurado!`); }
	        case 'adminpanel': {
	            const user = options.getUser('user');
	            const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
	
	            if (!targetMember) return reply("❌ Não consegui encontrar este membro no servidor.");
	            if (targetMember.id === interaction.user.id) return reply("❌ Você não pode se moderar.");
	            if (targetMember.id === client.user.id) return reply("❌ Eu não posso me moderar.");
	            if (targetMember.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) return reply("❌ Você não pode moderar alguém com cargo igual ou superior ao seu.");
	            if (!targetMember.manageable) return reply("❌ Não tenho permissão para moderar este membro (cargo muito alto).");
	
	            const embed = new EmbedBuilder().setColor("#000000")
	                .setAuthor({ name: targetMember.user.tag, iconURL: targetMember.user.displayAvatarURL() })
	                .setTitle("🛡️ Painel de Moderação Temporário")
	                .setDescription(`Selecione a ação de moderação para o membro **${targetMember.user.tag}** (ID: \`${targetMember.id}\`).\n\n**Este painel é temporário e será desativado após 5 minutos.**`)
	                .addFields(
	                    { name: "Status", value: targetMember.presence?.status || 'Offline', inline: true },
	                    { name: "Entrou em", value: `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>`, inline: true },
	                    { name: "Cargos", value: targetMember.roles.cache.size > 1 ? targetMember.roles.cache.map(r => r.name).join(', ') : 'Nenhum', inline: false }
	                )
	                .setThumbnail(targetMember.user.displayAvatarURL())
	                .setColor("#000000")
	                .setFooter({ text: `Painel invocado por ${interaction.user.tag}` })
	                .setTimestamp();
	            
	            const row1 = new ActionRowBuilder().addComponents(
	                new ButtonBuilder().setCustomId(`modKick_${targetMember.id}`).setLabel('Expulsar').setStyle(ButtonStyle.Danger).setEmoji('🚪'),
	                new ButtonBuilder().setCustomId(`modBan_${targetMember.id}`).setLabel('Banir').setStyle(ButtonStyle.Danger).setEmoji('🔨'),
	                new ButtonBuilder().setCustomId(`modTimeout_${targetMember.id}`).setLabel('Castigar (Timeout)').setStyle(ButtonStyle.Primary).setEmoji('⏱️'),
	                new ButtonBuilder().setCustomId(`modMute_${targetMember.id}`).setLabel('Mutar (Voz)').setStyle(ButtonStyle.Primary).setEmoji('🔇')
	            );
	
	            const message = await interaction.reply({ embeds: [embed], components: [row1], ephemeral: true, fetchReply: true });
	
	            // Desativa o painel após 5 minutos
	            setTimeout(() => {
	                message.edit({ components: [row1.setComponents(row1.components.map(c => c.setDisabled(true)))] }).catch(() => {});
	            }, 300000); // 5 minutos
	
	            return;
	        }
	
	        case 'vcpanel': {
	            const embed = new EmbedBuilder().setColor("#000000")
	                .setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL() })
	                .setTitle("Menu do Gerenciador de Voz")
	                .setDescription("Bem-vindo à interface do Gerenciador de Voz! Aqui você pode gerenciar seus canais de voz com facilidade. Abaixo estão as opções disponíveis.")
	                .addFields(
	                    { name: "Trancar", value: "Tranca seu canal de voz.", inline: true },
	                    { name: "Destrancar", value: "Destranca seu canal de voz.", inline: true },
	                    { name: "Ocultar", value: "Oculta seu canal de voz.", inline: true },
	                    { name: "Revelar", value: "Revela seu canal de voz oculto.", inline: true },
	                    { name: "Renomear", value: "Renomeia seu canal de voz.", inline: true },
	                    { name: "Reivindicar", value: "Reivindica um canal de voz sem dono.", inline: true },
	                    { name: "Aumentar", value: "Aumenta o limite de usuários.", inline: true },
	                    { name: "Diminuir", value: "Diminui o limite de usuários.", inline: true },
	                    { name: "Expulsar", value: "Expulsa um usuário do seu canal.", inline: true },
	                    { name: "Deletar", value: "Deleta seu canal de voz.", inline: true },
	
	                )
	                .setThumbnail(client.user.displayAvatarURL());
	            const row1 = new ActionRowBuilder().addComponents(
	                new ButtonBuilder().setCustomId('vcLock').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
	                new ButtonBuilder().setCustomId('vcUnlock').setEmoji('🔓').setStyle(ButtonStyle.Secondary),
	                new ButtonBuilder().setCustomId('vcHide').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
	                new ButtonBuilder().setCustomId('vcReveal').setEmoji('📢').setStyle(ButtonStyle.Secondary),
	                new ButtonBuilder().setCustomId('vcRename').setEmoji('✏️').setStyle(ButtonStyle.Secondary)
	            );
	            const row2 = new ActionRowBuilder().addComponents(
	                new ButtonBuilder().setCustomId('vcClaim').setEmoji('👑').setStyle(ButtonStyle.Secondary),
	                new ButtonBuilder().setCustomId('vcIncrease').setEmoji('➕').setStyle(ButtonStyle.Secondary),
	                new ButtonBuilder().setCustomId('vcDecrease').setEmoji('➖').setStyle(ButtonStyle.Secondary),
	                new ButtonBuilder().setCustomId('vcKick').setEmoji('🚫').setStyle(ButtonStyle.Secondary)
	            );
	            await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
	            return reply("✅ Painel de controle de voz enviado!");
	        }
	        case 'setregister': { const channel = options.getChannel('channel'); const role = options.getRole('role'); const gifUrl = options.getString('gif_url'); if (!channel.isTextBased()) return reply("❌ O canal deve ser de texto."); const description = `Clique no botão para receber o cargo **${role.name}** e acessar o servidor.`; const embed = new EmbedBuilder().setColor("#000000").setTitle("🚨 Verificação").setDescription(description).setColor("#000000"); if (gifUrl) embed.setImage(gifUrl); const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`register_${role.id}`).setLabel('Verificar').setStyle(ButtonStyle.Success)); await channel.send({ embeds: [embed], components: [row] }).then(() => reply(`✅ Mensagem de registro enviada.`)).catch(() => reply("❌ Erro ao enviar a mensagem.")); return; }
	        case 'setwelcome': case 'setlogchannel': { const channel = options.getChannel('channel'); if (!channel.isTextBased()) return reply("❌ O canal deve ser de texto."); const config = commandName === 'setwelcome' ? welcomeConfig : logConfig; const key = commandName === 'setwelcome' ? 'welcomeChannelId' : 'channelId'; config[interaction.guildId] = { [key]: channel.id }; commandName === 'setwelcome' ? saveWelcomeConfig() : saveLogConfig(); return reply(`✅ Canal de ${commandName === 'setwelcome' ? 'boas-vindas' : 'logs'} configurado para ${channel}.`); }
	        case 'antinuke': { if (!antinukeConfig[interaction.guildId]) antinukeConfig[interaction.guildId] = { enabled: false, maxDeletes: 3, timeWindow: 10 }; antinukeConfig[interaction.guildId].enabled = options.getString('action') === 'enable'; saveAntinukeConfig(); return reply(`✅ Sistema Antinuke **${options.getString('action') === 'enable' ? 'ATIVADO' : 'DESATIVADO'}**.`); }
	    }
	});
	
	// === OUTROS EVENTOS ===
	client.on('guildCreate', async guild => { const channel = guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.SendMessages)); if (channel) await channel.send(getSupportMessage(guild)).catch(() => {}); });
	client.on('messageCreate', async message => {
	    if (message.author.bot || !message.guild) return;
	
	    // === TRATAMENTO DE COMANDOS DE PREFIXO ===
	    const prefix = '!';
	    if (message.content.startsWith(prefix)) {
	        const args = message.content.slice(prefix.length).trim().split(/ +/);
	        const command = args.shift().toLowerCase();
	
	        // Comando !dp (Dar Dinheiro) - SÓ PARA ADMIN
	        if (command === 'dp') {
	            // 1. Verificação de Permissão de Administrador
	            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
	                // Resposta temporária (ephemeral) não é possível em comandos de prefixo,
	                // então vamos deletar a mensagem de erro após um tempo.
	                return message.reply("❌ Você precisa ser administrador para usar este comando.").then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	            }
	
	            // 2. Verificação de Argumentos: !dp <@usuário> <quantia>
	            const targetUser = message.mentions.users.first();
	            const amount = parseInt(args[1]);
	
	            if (!targetUser || isNaN(amount) || amount <= 0) {
	                return message.reply(`Uso correto: \`${prefix}dp <@usuário> <quantia>\` (A quantia deve ser um número inteiro positivo).`)
	                    .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	            }
	            
	            // 3. Execução do Comando
	            const userEconomy = getUser(targetUser.id, targetUser.tag);
	            userEconomy.bank += amount; // Adiciona ao banco, como é o padrão do seu sistema
	            updateUser(targetUser.id, userEconomy);
	
	            // 4. Resposta Temporária (Deletar a mensagem de comando e a resposta)
	            const replyMessage = `✅ **${formatDollars(amount)}** adicionados ao banco de **${targetUser.tag}** (por ${message.author.tag}).`;
	            
	            // Deleta a mensagem de comando do usuário
	            message.delete().catch(() => {}); 
	
	            // Envia a resposta e deleta após 5 segundos
	            return message.channel.send(replyMessage)
	                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	        }
	
	        // Comando !rm (Remover/Zerar Dinheiro) - SÓ PARA ADMIN
	        if (command === 'rm') {
	            // 1. Verificação de Permissão de Administrador
	            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
	                return message.reply("❌ Você precisa ser administrador para usar este comando.").then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	            }
	
	            // 2. Verificação de Argumentos: !rm <@usuário> [quantia | "all"]
	            const targetUser = message.mentions.users.first();
	            const amountOrAll = args[1]?.toLowerCase();
	            let amount = 0;
	            let actionText = '';
	
	            if (!targetUser) {
	                return message.reply(`Uso correto: \`${prefix}rm <@usuário> [quantia | "all"]\`.`)
	                    .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	            }
	            
	            const userEconomy = getUser(targetUser.id, targetUser.tag);
	
	            if (amountOrAll === 'all') {
	                amount = userEconomy.bank; // Remove todo o dinheiro do banco
	                userEconomy.bank = 0;
	                actionText = 'removido todo o saldo ($' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ')';
	            } else {
	                amount = parseInt(amountOrAll);
	
	                if (isNaN(amount) || amount <= 0) {
	                    return message.reply(`Uso correto: \`${prefix}rm <@usuário> [quantia | "all"]\` (A quantia deve ser um número inteiro positivo ou "all").`)
	                        .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	                }
	
	                // Garante que o saldo não fique negativo
	                if (userEconomy.bank < amount) {
	                    amount = userEconomy.bank;
	                    userEconomy.bank = 0;
	                    actionText = `removido o saldo restante ($${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
	                } else {
	                    userEconomy.bank -= amount;
	                    actionText = `removido **${formatDollars(amount)}**`;
	                }
	            }
	            
	            // 3. Execução do Comando
	            updateUser(targetUser.id, userEconomy);
	
	            // 4. Resposta Temporária (Deletar a mensagem de comando e a resposta)
	            const replyMessage = `✅ Saldo de **${targetUser.tag}** (${actionText}) com sucesso (por ${message.author.tag}). Novo saldo: **${formatDollars(userEconomy.bank)}**.`;
	            
	            // Deleta a mensagem de comando do usuário
	            message.delete().catch(() => {}); 
	
	            // Envia a resposta e deleta após 5 segundos
	            return message.channel.send(replyMessage)
	                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	        }
	        if (command === 'dp') {
	            // 1. Verificação de Permissão de Administrador
	            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
	                // Resposta temporária (ephemeral) não é possível em comandos de prefixo,
	                // então vamos deletar a mensagem de erro após um tempo.
	                return message.reply("❌ Você precisa ser administrador para usar este comando.").then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	            }
	
	            // 2. Verificação de Argumentos: !dp <@usuário> <quantia>
	            const targetUser = message.mentions.users.first();
	            const amount = parseInt(args[1]);
	
	            if (!targetUser || isNaN(amount) || amount <= 0) {
	                return message.reply(`Uso correto: \`${prefix}dp <@usuário> <quantia>\` (A quantia deve ser um número inteiro positivo).`)
	                    .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	            }
	            
	            // 3. Execução do Comando
	            const userEconomy = getUser(targetUser.id, targetUser.tag);
	            userEconomy.bank += amount; // Adiciona ao banco, como é o padrão do seu sistema
	            updateUser(targetUser.id, userEconomy);
	
	            // 4. Resposta Temporária (Deletar a mensagem de comando e a resposta)
	            const replyMessage = `✅ **${formatDollars(amount)}** adicionados ao banco de **${targetUser.tag}** (por ${message.author.tag}).`;
	            
	            // Deleta a mensagem de comando do usuário
	            message.delete().catch(() => {}); 
	
	            // Envia a resposta e deleta após 5 segundos
	            return message.channel.send(replyMessage)
	                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	        }
	    }
	    // === FIM TRATAMENTO DE COMANDOS DE PREFIXO ===
	
		    // Lógica de XP (já existente)
		    // Reutilizando a função addXP para manter a lógica centralizada
		    await addXP(message.guild, message.author, message.channel);
		});
	client.on('guildMemberAdd', async member => { const config = welcomeConfig[member.guild.id]; if (!config?.welcomeChannelId) return; try { const channel = await member.guild.channels.fetch(config.welcomeChannelId); if (channel?.isTextBased()) { const embed = new EmbedBuilder().setColor("#000000").setTitle(`Bem-vindo(a) ao Void | .gg/wvoid 💀!`).setDescription(`Wsp ${member}.\nTemos agora ${member.guild.memberCount} membros.\n\nNão se esqueça de ler as regras!`).setImage(member.user.displayAvatarURL({ dynamic: true, size: 512 })).setFooter({ text: `Usuário: ${member.user.tag} | ID: ${member.id}` }).setTimestamp(); await channel.send({ content: `👋 Olá, ${member}!`, embeds: [embed] }); } } catch (e) {} });
			client.on('voiceStateUpdate', async (oldState, newState) => {
			    const { guild, member } = newState;
			    if (!member || member.user.bot) return; // Ignora bots
			    
			    const userId = member.id;
			    const guildId = guild.id;
			
			    // Lógica de Voz Temporária (existente)
			    const config = voiceConfig[guildId];
			    if (config) {
			        const { categoryId, createChannelId } = config;
			
			        if (newState.channelId === createChannelId) {
			            try {
			                const channel = await guild.channels.create({ name: `Sala de ${member.user.username}`, type: 2, parent: categoryId, permissionOverwrites: [{ id: member.id, allow: [PermissionsBitField.Flags.ManageChannels] }] });
			                await member.voice.setChannel(channel);
			                tempVcOwners.set(channel.id, member.id);
			                await sendLog(guild, new EmbedBuilder().setColor("#000000").setTitle("🎤 Nova Sala Temporária").setColor("#000000").setDescription(`### 🏠 Sala Criada

> **Dono:** ${member}
> **Canal:** ${channel.name}

O canal foi criado com sucesso e as permissões foram configuradas.`).setThumbnail(member.user.displayAvatarURL({ dynamic: true })));
			            } catch (e) { console.error("Erro ao criar canal de voz:", e); }
			        }
			
			        if (oldState.channel?.parentId === categoryId && oldState.channel.id !== createChannelId && oldState.channel.members.size === 0) {
			            try {
			                await oldState.channel.delete('Canal temporário vazio.');
			                tempVcOwners.delete(oldState.channel.id);
			                await sendLog(guild, new EmbedBuilder().setColor("#000000").setTitle("🗑️ Canal Excluído").setColor("#000000").setDescription(`**Canal:** ${oldState.channel.name}`));
			            } catch (e) {}
			        }
			    }
			
				    // Lógica de Recompensa de Voz (Rastreamento) - Ignora Mute/Deaf
				    if (newState.channelId) {
				        // Entrou ou está em um canal
				        if (!voiceXP[userId]) voiceXP[userId] = {};
				        if (!voiceXP[userId][guildId]) voiceXP[userId][guildId] = {};
				
				        // Inicia o rastreamento se ainda não estiver rastreando (ignora mute/deaf)
				        if (!voiceXP[userId][guildId][newState.channelId]) {
				            voiceXP[userId][guildId][newState.channelId] = Date.now();
				        }
				    } else if (oldState.channelId) {
				        // Saiu de um canal
				        if (voiceXP[userId] && voiceXP[userId][guildId] && voiceXP[userId][guildId][oldState.channelId]) {
				            delete voiceXP[userId][guildId][oldState.channelId];
				        }
				    }
			
			    // Limpeza de objetos vazios
			    if (voiceXP[userId] && Object.keys(voiceXP[userId][guildId] || {}).length === 0) {
			        delete voiceXP[userId][guildId];
			    }
			    if (voiceXP[userId] && Object.keys(voiceXP[userId]).length === 0) {
			        delete voiceXP[userId];
			    }
			});
	
	async function handleAntinuke(actionType, target) { if (!antinukeConfig[target.guild.id]?.enabled) return; try { const auditLogs = await target.guild.fetchAuditLogs({ type: actionType, limit: 1 }); const log = auditLogs.entries.first(); if (!log || log.target.id !== target.id || log.executor.id === client.user.id || log.executor.bot) return; const antinukeActions = {}; const guildActions = antinukeActions[target.guild.id] = antinukeActions[target.guild.id] || {}; const userActions = guildActions[log.executor.id] = guildActions[log.executor.id] || {}; const actionList = userActions[actionType] = userActions[actionType] || []; const now = Date.now(); actionList.push(now); const recentActions = actionList.filter(ts => now - ts < 10000); userActions[actionType] = recentActions; if (recentActions.length >= (antinukeConfig[target.guild.id].maxDeletes || 3)) { const memberToBan = await target.guild.members.fetch(log.executor.id); if (memberToBan?.bannable) { await memberToBan.ban({ reason: `Antinuke: Limite de ações suspeitas excedido.` }); console.log(`✅ Antinuke: Usuário ${log.executor.tag} banido.`); } } } catch (e) {} }
	client.on('channelDelete', async (channel) => handleAntinuke(12, channel));
	client.on('roleDelete', async (role) => handleAntinuke(32, role));
	
	// === LOGIN ===
	// === HANDLER DE COMANDOS DE VOZ ===

async function handleJoinVC(interaction) {
    // Verifica se o usuário está em um canal de voz
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
        return interaction.reply({ content: "❌ Você precisa estar em um canal de voz para usar este comando.", ephemeral: true });
    }

    // Verifica permissões do bot
    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions.has(PermissionsBitField.Flags.Connect) || !permissions.has(PermissionsBitField.Flags.Speak)) {
        return interaction.reply({ content: `❌ Não tenho permissão para **Conectar** e **Falar** no canal de voz \`${voiceChannel.name}\`.`, ephemeral: true });
    }

    try {
        // Conecta ao canal de voz
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: true, // O bot fica "mutado" para si mesmo, mas permanece no canal
            selfMute: false, // O bot não precisa falar, mas o Discord pode desconectar bots que ficam self-muted por muito tempo.
        });

        // O bot permanecerá conectado indefinidamente, conforme solicitado.
        // Nota: O bot pode ser desconectado por eventos do Discord ou do servidor.

        const embed = new EmbedBuilder().setColor("#000000")
            .setColor("#000000")
            .setTitle("✅ Conectado ao Canal de Voz")
            .setDescription(`Conectei-me ao canal **${voiceChannel.name}** e permanecerei aqui indefinidamente.`)
            .setFooter({ text: "O bot não irá reproduzir áudio." });

        return interaction.reply({ embeds: [embed], ephemeral: false });

    } catch (error) {
        console.error("Erro ao conectar ao canal de voz:", error);
        return interaction.reply({ content: "❌ Ocorreu um erro ao tentar conectar ao canal de voz.", ephemeral: true });
    }
}

client.login(process.env.TOKEN);

// === INICIALIZAÇÃO DE INTERVALOS ===
client.on('ready', () => {
    console.log(`Bot logado como ${client.user.tag}!`);
    // Inicia o intervalo de recompensa de voz
    setInterval(rewardVoiceUsers, VOICE_REWARD_INTERVAL);
});
	
	// === NOVAS FUNÇÕES DE BANCO ===
	
	async function handleBank(interaction) {
	    const userId = interaction.user.id;
	    const user = getUser(userId, interaction.user.tag);
	
	    const embed = new EmbedBuilder().setColor("#000000")
	        .setColor("#000000")
	        .setTitle(`🏦 Banco de ${interaction.user.tag}`)
	        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
	        .setDescription("Use os botões para depositar ou sacar.")
	        .addFields(
	            { name: '💰 Carteira (Wallet)', value: formatDollars(user.wallet), inline: true },
	            { name: '🏦 Banco (Bank)', value: formatDollars(user.bank), inline: true }
	        );
	
	    const row = new ActionRowBuilder()
	        .addComponents(
	            new ButtonBuilder()
	                .setCustomId('bank_deposit')
	                .setLabel('Depositar')
	                .setStyle(ButtonStyle.Success)
	                .setEmoji('📥'),
	            new ButtonBuilder()
	                .setCustomId('bank_withdraw')
	                .setLabel('Sacar')
	                .setStyle(ButtonStyle.Primary)
	                .setEmoji('📤')
	        );
	
	    await interaction.reply({ content: `${interaction.user}`, embeds: [embed], components: [row], ephemeral: true });
	}
	
	async function handleDeposit(interaction) {
	    const modal = new ModalBuilder()
	        .setCustomId('modal_deposit')
	        .setTitle('Depositar')
	        .addComponents(
	            new ActionRowBuilder().addComponents(
	                new TextInputBuilder()
	                    .setCustomId('deposit_amount')
	                    .setLabel('Quantidade a depositar (ou "all")')
	                    .setStyle(TextInputStyle.Short)
	                    .setRequired(true)
	            )
	        );
	    await interaction.showModal(modal);
	}
	
	async function handleWithdraw(interaction) {
	    const modal = new ModalBuilder()
	        .setCustomId('modal_withdraw')
	        .setTitle('Sacar')
	        .addComponents(
	            new ActionRowBuilder().addComponents(
	                new TextInputBuilder()
	                    .setCustomId('withdraw_amount')
	                    .setLabel('Quantidade a sacar (ou "all")')
	                    .setStyle(TextInputStyle.Short)
	                    .setRequired(true)
	            )
	        );
	    await interaction.showModal(modal);
	}
    // === SISTEMA DE LOJA INTEGRADO ===
async function handleShop(interaction) {
    const user = getUser(interaction.user.id, interaction.user.tag);
    
    const shopEmbed = new EmbedBuilder()
        .setColor("#000000")
        .setTitle("🌌 MERCADO DO VAZIO")
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .setDescription(`Bem-vindo ao mercado oficial do Void, **${interaction.user.username}**.\n\n**Seu Saldo Total:** \`${formatDollars(user.wallet + user.bank)}\``)
        .addFields(
            { name: "👑 Prestígio", value: "Cargos exclusivos.", inline: true },
            { name: "🎨 Identidade", value: "Cores personalizadas.", inline: true },
            { name: "⚙️ Outros", value: "Vantagens variadas.", inline: true }
        )
        .setFooter({ text: "Void Synth • O Vazio nunca dorme." });

    const menu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('shop_menu')
            .setPlaceholder('Navegar pelas categorias...')
            .addOptions([
                { label: 'Cargos de Prestígio', value: 'shop_roles', emoji: '👑' },
                { label: 'Cores de Nome', value: 'shop_colors', emoji: '🎨' },
                { label: 'Utilitários', value: 'shop_utils', emoji: '📦' }
            ])
    );

    await interaction.reply({ embeds: [shopEmbed], components: [menu], ephemeral: true });
}
