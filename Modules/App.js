// 主应用模块

import {
    request,
    corsProxy,
    fetchMojangProfile,
    fetchSkinWebsiteProfile,
} from './Network.js';

import {
    popupTips,
    popupDialog,
    checkInputValue,
    closeSelections,
    handleUploader,
    downloadWithBackground,
    downloadTransparent,
} from './Utils.js';

import { initI18n } from './I18n.js';
import { calculateAutoColors } from './Renderers/Image.js';
import { renderBackground, renderAvatar, regulateAvatar } from './Renderers/Index.js';


// 应用状态
class AppState {
    constructor() {
        this.defaultSkin = new Image();
        this.defaultSkin.src = 'Resources/Default.png';

        this.currentSkinImage = null;
        this.currentAvatarImage = null;
        this.currentRegulatedAvatarImage = null;
        this.currentRegulatedBackgroundImage = null;

        this.modelType = 'minimal';
        this.fetchSkinMethod = 'mojang';
        this.options = {};

        // DOM元素
        this.content = document.querySelector('.generator-content');
        this.uploadInput = document.querySelector('.file-upload-input');
        this.current = this.content.querySelector('#active-content');
        this.currentCanvas = this.current.querySelector('canvas');
        this.alertDialog = document.querySelector('#alert-dialog');
        this.editDialog = document.querySelector('#edit-dialog');
        this.dialogOverlay = document.querySelector('#dialog-overlay');
        this.skinWebsiteInput = document.querySelector('.skin-website');
    }
}

// 应用类
class AvatarGeneratorApp {
    constructor() {
        this.state = new AppState();
    }

    /**
     * 初始化应用
     */
    async init() {
        try {
            // 初始化国际化
            initI18n();
            // 初始化对话框
            this.initEditDialogs();
            // 初始化事件监听
            this.initEventListeners();
            // 从弹窗中读取默认选项
            this.state.options = this.readOptions(this.state.modelType);

            this.state.defaultSkin.onerror = () => popupTips('加载默认头像失败！', 'error');
            this.state.defaultSkin.onload = () => {
                this.state.currentSkinImage = this.state.defaultSkin;
                this.state.currentRegulatedBackgroundImage = renderBackground(this.state.modelType, this.state.options.background);
                this.renderAvatar();
            };
                
            this.setAdvertisement();            
            this.popupAnnouncement();
            console.log('初始化应用完成！');
        } catch (error) {
            console.error('应用初始化失败:', error);
            popupTips('应用初始化失败！', 'error');
        }
    }

    initEditDialogs() {
        const colorItems = this.state.editDialog.querySelectorAll('div.color-item');
        colorItems.forEach(item => {
            const colors = item.getAttribute('value').split(',');
            if (colors.length <= 1) {
                item.style.background = colors[0];
                return;
            }
            if (item.parentElement.parentElement.parentElement.id.includes('vintage'))
                item.style.background = 'linear-gradient(to right, ' + colors.join(' 50%, ') + ' 50%)'
            else item.style.background = 'linear-gradient(to right, ' + colors.join(', ') + ')';
        });
    }

    /**
     * 初始化事件监听
     */
    initEventListeners() {
        // 全局点击事件
        window.addEventListener('click', closeSelections);
        // 添加关闭对话框的事件
        this.state.dialogOverlay.addEventListener('click', event => {
            if (this.state.alertDialog.classList.contains('show')) return;
            if (event.target == this.state.dialogOverlay) this.hideEditDialog();
        });

        // 文件上传事件
        this.state.uploadInput.addEventListener('change', async event => {
            this.state.currentSkinImage = await handleUploader(event);
            event.target.value = null;
            this.renderAvatar();
        });

        // 头像类型选择事件（仅Minimal）额外判断
        document.querySelectorAll('input[name=minimal-option]').forEach(radio =>
            radio.addEventListener('change', event => {
                this.state.options.generate.type = event.target.id;
                this.state.options.generate.scale = 100;
                this.updateEditDialogs(event.target.parentElement.parentElement.parentElement);
                this.generate();
            })
        );

        // 头像类型选择事件（仅Minimal）额外判断
        document.querySelectorAll('input[name=side-option]').forEach(radio =>
            radio.addEventListener('change', event => {
                this.state.options.generate.texture = event.target.id == 'enable';
                this.renderAvatar();
            })
        );

        // 滑块通用选项改变
        document.querySelectorAll('input.range-slider').forEach(input => {
            function updateOptions(event) {
                this.updateRangeProgress(event.target);
                const [ type, option ] = event.target.getAttribute('option').split('-');
                this.state.options[type][option] = parseInt(event.target.value);
                if (type == 'background' && option == 'angle') 
                    this.updateEditDialogs(event.target.parentElement.parentElement, event.target.value);
                if (this.state.modelType == 'vintage' && option == 'border') {
                    this.renderAvatar();
                    return;
                }
                if (type == 'generate')
                    this.state.currentRegulatedAvatarImage = regulateAvatar(this.state.currentAvatarImage, this.state.options.generate);
                else this.state.currentRegulatedBackgroundImage = renderBackground(this.state.modelType, this.state.options.background);
                this.updateCanvas();
            }
            
            input.addEventListener('input', updateOptions.bind(this));
        });

        // 默认颜色选择
        document.querySelectorAll('div.color-item').forEach(item => {
            function updateColorOptions(event) {
                const colors = event.target.getAttribute('value').split(',');
                const lastSelected = document.querySelectorAll('#selected');
                if (lastSelected) lastSelected.forEach(item => item.id = '');
                event.target.id = 'selected';
                const [ type, option ] = event.target.getAttribute('option').split('-');
                this.state.options.background.image = null;
                this.state.options[type][option] = colors;
                if (this.state.modelType == 'vintage' && option == 'color') {
                    this.renderAvatar();
                    return;
                }
                this.state.currentRegulatedBackgroundImage = renderBackground(this.state.modelType, this.state.options.background);
                this.updateCanvas();
            }

            item.addEventListener('click', updateColorOptions.bind(this));
        });

        document.querySelectorAll('input.color-picker').forEach(item => {
            function updateColorOptions(event) {
                const pickers = Array.from(event.target.parentElement.querySelectorAll('input.color-picker'));
                const colors = pickers.length > 1 ? pickers.map(picker => picker.value) : [event.target.value];
                const lastSelected = document.querySelectorAll('#selected');
                if (lastSelected) lastSelected.forEach(item => item.id = '');
                event.target.id = 'selected';
                const [ type, option ] = event.target.getAttribute('option').split('-');
                this.state.options.background.image = null;
                this.state.options[type][option] = colors;
                if (this.state.modelType == 'vintage' && option == 'color') {
                    this.renderAvatar();
                    return;
                }
                this.state.currentRegulatedBackgroundImage = renderBackground(this.state.modelType, this.state.options.background);
                this.updateCanvas();
            }

            item.addEventListener('input', updateColorOptions.bind(this));
        });

        // 下载事件
        document.querySelectorAll('button[download-type]').forEach(item =>
            item.addEventListener('click', event => this.handleDownload(event))
        );

        // 标签页切换事件
        document.querySelectorAll('input[name=tabs]').forEach((tab, index) =>
            tab.addEventListener('change', this.switchPanel(index))
        );

        // 头像类型切换事件
        document.querySelectorAll('input[name=model-type]').forEach(button =>
            button.addEventListener('click', event => this.switchModelType(event))
        );

        // 输入验证事件
        document.querySelectorAll('input.text-input').forEach(input =>
            input.addEventListener('input', checkInputValue(/[^a-zA-Z0-9-_.]/g))
        );

        document.querySelectorAll('input.upload-background').forEach(input =>
            input.addEventListener('change', async event => {
                try {
                    const image = await handleUploader(event);
                    const colorSelected = document.querySelector('#selected');
                    if (colorSelected) colorSelected.id = '';
                    this.state.options.background.image = image;
                    this.state.currentRegulatedBackgroundImage = renderBackground(this.state.modelType, this.state.options.background);
                    this.updateCanvas();
                    popupTips('背景图片上传成功！', 'success');
                } catch (error) {
                    popupTips(error, 'error');
                }
            })
        );

        document.querySelectorAll('button.generate').forEach(button =>
            button.addEventListener('click', this.generate.bind(this))
        );

        // 编辑按钮事件
        document.querySelectorAll('button.edit-generate, button.edit-background').forEach(button =>
            button.addEventListener('click', event => this.showEditDialog(event))
        );

        document.querySelectorAll('a.float-tips-link').forEach(link => {
            const type = link.parentElement.getAttribute('for');
            const tips = document.querySelector(`div.float-tips[for=${type}]`);
            link.addEventListener('mouseover', _ => tips.classList.remove('hidden'));
            link.addEventListener('mouseout', _ => tips.classList.add('hidden'));
            link.addEventListener('mousemove', event => {
                tips.style.left = `${event.clientX + 10}px`;
                tips.style.top = `${event.clientY + 10}px`;
            });
        });

        // 初始化对话框
        this.initEditDialogs();
    }

    /**
     * 更新对话框
     */
    updateEditDialogs(dialog, angle=null) {
        if (dialog.id.includes('background')) {
            let flag = false;
            const currentColor = this.state.options.background.colors.join(',');
            for (const item of dialog.querySelectorAll('div.color-item')) {
                if (item.getAttribute('value') == currentColor) {
                    item.id = 'selected';
                    flag = true;
                } else item.id = '';
                if (angle && !dialog.id.includes('vintage'))
                    item.style.background = `linear-gradient(${angle - 270}deg, ${item.getAttribute('value')})`;
            }
            if (!this.state.options.background.image && !flag)
                dialog.querySelectorAll('input.color-picker').forEach(item => item.id = 'selected');
        } else if (this.state.modelType == 'vintage' && dialog.id.includes('generate')) {
            // 在生成对话框中，如果当前皮肤不为空，则自动计算颜色
            if (this.state.currentSkinImage.src) {
                const selectedItem = dialog.querySelector('#selected');
                const colorItems = dialog.querySelectorAll('div.color-item');
                const autoColors = calculateAutoColors(this.state.currentSkinImage);
                if (selectedItem) selectedItem.id = '';
                colorItems[0].id = 'selected';
                for (let index = 1; index < colorItems.length; index++) {
                    const item = colorItems[index];
                    item.style.background = autoColors[index - 1];
                    item.setAttribute('value', autoColors[index - 1]);
                }
            } else popupTips('请先获取皮肤，否则无法自动计算颜色！', 'warning');
        }

        const rangeInputs = dialog.querySelectorAll('input.range-slider');
        rangeInputs.forEach(input => {
            // 初始化进度条
            const [ type, option ] = input.getAttribute('option').split('-');
            input.value = this.state.options[type][option];
            this.updateRangeProgress(input);
        });
    }

    /**
     * 从弹窗中读取默认选项
     */
    readOptions(modelType) {
        const newOptions = { generate: {}, background: {} };

        // 读取生成选项
        const generateDialog = document.getElementById(`dialog-${modelType}-generate`);
        if (generateDialog) {
            const rangeInputs = generateDialog.querySelectorAll('input.range-slider');
            rangeInputs.forEach(input => {
                const [type, option] = input.getAttribute('option').split('-');
                newOptions[type][option] = parseInt(input.value);
            });

            // 读取单选按钮选项（如Minimal的生成模式）
            const radioInputs = generateDialog.querySelectorAll('input[type="radio"]:checked');
            radioInputs.forEach(radio => {
                if (radio.name == 'minimal-option') {
                    newOptions.generate.type = radio.id;
                } else if (radio.name == 'side-option') {
                    newOptions.generate.texture = radio.id == 'enable';
                }
            });

            // 读取颜色选择器
            const colorPicker = generateDialog.querySelector('input.color-picker');
            if (colorPicker) newOptions.generate.color = colorPicker.value;
            
            // 检查生成弹窗中的color-item（如Vintage模型的边线颜色）
            const colorItems = generateDialog.querySelectorAll('div.color-item');
            if (colorItems.length > 0) {
                const selectedColorItem = generateDialog.querySelector('div.color-item#selected');
                if (selectedColorItem) {
                    // 如果有选中的color-item，使用其值
                    const colors = selectedColorItem.getAttribute('value').split(',');
                    newOptions.generate.color = colors[0]; // 对于生成选项，通常只需要第一个颜色
                } else {
                    // 如果没有选中的color-item，使用第一个color-item的值
                    const firstColorItem = colorItems[0];
                    const colors = firstColorItem.getAttribute('value').split(',');
                    newOptions.generate.color = colors[0];
                }
            }
        }

        // 读取背景选项
        const backgroundDialogId = `dialog-${modelType}-background`;
        const backgroundDialog = document.getElementById(backgroundDialogId);
        if (backgroundDialog) {
            const rangeInputs = backgroundDialog.querySelectorAll('input.range-slider');
            rangeInputs.forEach(input => {
                const [type, option] = input.getAttribute('option').split('-');
                newOptions[type][option] = parseInt(input.value);
            });

            // 读取颜色选择器
            const colorPicker = backgroundDialog.querySelector('input.color-picker');
            const colorItems = backgroundDialog.querySelectorAll('div.color-item');
            
            if (colorPicker) {
                const option = colorPicker.getAttribute('option');
                if (option) {
                    const [type, optionName] = option.split('-');
                    const selectedColorItem = backgroundDialog.querySelector('div.color-item#selected');
                    if (selectedColorItem) {
                        const colors = selectedColorItem.getAttribute('value').split(',');
                        newOptions[type][optionName] = colors;
                    } else {
                        const firstColorItem = colorItems[0];
                        if (firstColorItem) {
                            const colors = firstColorItem.getAttribute('value').split(',');
                            newOptions[type][optionName] = colors;
                        } else newOptions[type][optionName] = [colorPicker.value];
                    }
                } else {
                    const selectedColorItem = backgroundDialog.querySelector('div.color-item#selected');
                    if (selectedColorItem) {
                        const colors = selectedColorItem.getAttribute('value').split(',');
                        newOptions.background.colors = colors;
                    } else {
                        const firstColorItem = colorItems[0];
                        if (firstColorItem) {
                            const colors = firstColorItem.getAttribute('value').split(',');
                            newOptions.background.colors = colors;
                        } else newOptions.background.colors = [colorPicker.value];
                    }
                }
            } else if (colorItems.length > 0) {
                const firstColorItem = colorItems[0];
                const colors = firstColorItem.getAttribute('value').split(',');
                newOptions.background.colors = colors;
            }
        }
        return newOptions;
    }

    switchModelType(event) {
        const modelType = event.target.id;
        if (this.state.modelType == modelType) return;
        
        // 更新选项
        this.state.modelType = modelType;
        this.state.options = this.readOptions(modelType);
        this.state.currentSkinImage = this.state.defaultSkin;
        this.state.currentRegulatedBackgroundImage = renderBackground(this.state.modelType, this.state.options.background);
        this.renderAvatar();
        
        popupTips(`已切换到 ${modelType.charAt(0).toUpperCase() + modelType.slice(1)} 头像类型！`, 'success');
    }

    /**
     * 切换内容面板
     */
    switchPanel(index) {
        const transform = index * 400;
        return event => {
            this.state.current.id = '';
            const panelId = event.target.id;
            this.state.fetchSkinMethod = panelId;
            this.state.current = this.state.content.querySelector(`.tab-panel-${panelId}`);
            this.state.currentCanvas = this.state.current.querySelector('canvas');
            this.state.current.id = 'active-content';
            this.state.content.style.transform = `translateX(-${transform}px)`;
            this.updateCanvas();
        };
    }

    /**
     * 更新画布
     */
    updateCanvas() {
        const context = this.state.currentCanvas.getContext('2d');
        // 清空画布
        context.clearRect(0, 0, 1000, 1000);
        context.drawImage(this.state.currentRegulatedBackgroundImage, 0, 0, 1000, 1000);
        context.drawImage(this.state.currentRegulatedAvatarImage, 0, 0, 1000, 1000);
    }

    /**
     * 处理下载
     */
    handleDownload(event) {
        const downloadType = event.target.getAttribute('download-type');
        if (downloadType == 'background') downloadWithBackground(this.state.currentCanvas);
        else if (downloadType == 'transparent') downloadTransparent(this.state.currentRegulatedAvatarImage);
    }

    /**
     * 更新拖动条进度条
     */
    updateRangeProgress(input) {
        const value = (input.value - input.min) / (input.max - input.min) * 100;
        const valueElement = input.nextElementSibling.querySelector('span.range-slider-value');
        const progressColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-color');
        const trackColor = '#e0e4f6';
        valueElement.textContent = input.value;
        input.style.background = `linear-gradient(to right, ${progressColor} 0%, ${progressColor} ${value}%, ${trackColor} ${value}%, ${trackColor} 100%)`;
    }

    /**
     * 显示编辑对话框
     */
    showEditDialog(event) {
        const button = event.target;
        const dialogType = button.classList.contains('edit-generate') ? 'generate' : 'background';
        // 构建对话框ID
        const dialog = document.getElementById(`dialog-${this.state.modelType}-${dialogType}`);

        if (dialog) {
            // 显示遮罩层和对话框
            if (dialogType == 'background' && !dialog.id.includes('vintage'))
                this.updateEditDialogs(dialog, this.state.options.background.angle);
            else this.updateEditDialogs(dialog);
            // 强制重绘，然后添加动画类
            requestAnimationFrame(() => {
                this.state.dialogOverlay.classList.add('show');
                this.state.editDialog.classList.add('show');
            });
            // 隐藏所有对话框内容
            this.state.dialogOverlay.querySelectorAll('.dialog-content').forEach(content =>
                content.classList.add('hidden')
            );
            // 显示对应的对话框内容
            dialog.classList.remove('hidden');
            event.stopPropagation();
        }
    }

    /**
     * 隐藏编辑对话框
     */
    hideEditDialog() {
        // 移除动画类
        this.state.dialogOverlay.classList.remove('show');
        this.state.editDialog.classList.remove('show');
    }

    fetchSkin() {
        return new Promise(async (resolve, reject) => {
            if (this.state.fetchSkinMethod == 'upload') return resolve(this.state.currentSkinImage);
            const input = this.state.current.querySelector('input.player-name');
            if (!input.value) return resolve(popupTips('请输入用户名！', 'warning'));
            if (this.state.fetchSkinMethod == 'website' && !this.state.skinWebsiteInput.value)
                return resolve(popupTips('请输入皮肤站地址！', 'warning'));
            // 加载皮肤图像
            const skinImage = new Image();
            skinImage.onload = () => {
                skinImage.onload = null;
                return resolve(skinImage);
            }

            skinImage.onerror = () => {
                skinImage.src = null;
                skinImage.onerror = null;
                return reject('加载皮肤图像失败！');
            };

            skinImage.crossOrigin = 'anonymous';
            if (this.state.fetchSkinMethod == 'website') {
                // 皮肤站模式
                const website = 'https://' + this.state.skinWebsiteInput.value;
                const skinData = await fetchSkinWebsiteProfile(website, input.value);
                if (!skinData || !skinData.skins) return reject('未找到该玩家的皮肤数据！');
                const texturePath = Object.values(skinData.skins)[0];
                skinImage.src = `${corsProxy}${website}/textures/${texturePath}`;
            } else {
                // Mojang模式
                const profile = await fetchMojangProfile(input.value);
                if (!profile) return reject('未找到该玩家的信息！');
                skinImage.src = `https://minotar.net/skin/${profile.id}`;
            }
        });
    }

    /**
     * 生成头像（Mojang/皮肤站）
     */
    renderAvatar() {
        try {
            this.state.currentAvatarImage = renderAvatar(this.state.currentSkinImage, this.state.modelType, this.state.options.generate);
            this.state.currentRegulatedAvatarImage = regulateAvatar(this.state.currentAvatarImage, this.state.options.generate);
            this.updateCanvas();
        } catch (error) {
            console.error('生成头像失败：', error);
            throw error;
        }
    }

    async generate() {
        const container = this.state.current.querySelector('.canvas-container');
        container.classList.add('loading');
        try {
            const skinImage = await this.fetchSkin();
            if (!skinImage) {
                container.classList.remove('loading');
                return;
            }
            this.state.currentSkinImage = skinImage;
            this.renderAvatar();
            popupTips('生成头像成功！', 'success');
        } catch (error) {
            popupTips(`生成头像失败，${error}`, 'error');
        } finally {
            container.classList.remove('loading');
        }
    }

    async popupAnnouncement() {
        const url = `/Resources/Data/Announcement.json?${Math.random()}`
        const announcement = await request(url, false);
        if (!announcement) return console.warn('加载公告失败！');
        const { title, date, content } = announcement;
        if (title && date && content) {
            if (localStorage.getItem('announcement') == date) return;
            if (content.includes('<script>')) return popupTips('检测到公告被注入！请检查网络环境！', 'error');
            if (await popupDialog(title, content)) localStorage.setItem('announcement', date);
        }
    }

    async setAdvertisement() {
        const advertisement = await request('/Resources/Advertisement/Config.json', false);
        if (!advertisement) return console.warn('加载广告配置失败！');
        if (advertisement.expire && new Date(advertisement.expire) <= Date.now()) return console.log('监测到广告过期，已禁用。');
        const link = document.querySelector('section.donate-section a');
        if (advertisement.links.union) link.href = advertisement.links.union;
        else link.href = (window.innerWidth <= 950) ? advertisement?.links?.small : advertisement?.links?.big;
        if (advertisement?.images?.big)
            document.documentElement.style.setProperty('--advertisement-images-big', `url(${advertisement.images.big})`);
        if (advertisement?.images?.small)
            document.documentElement.style.setProperty('--advertisement-images-small', `url(${advertisement.images.small})`);
    }
}

// 导出应用类
export default AvatarGeneratorApp;