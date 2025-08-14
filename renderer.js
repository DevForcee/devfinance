const { ipcRenderer } = require('electron');

let username = 'usuario';
let dados = { renda: 0, pastas: {} };
let myChart;
let currentPastaName = null;

// --- Referências a elementos HTML ---
const gastoTotalSpan = document.getElementById('gasto-total');
const saldoDisponivelSpan = document.getElementById('saldo-disponivel');

const btnCriarPasta = document.getElementById('btn-criar-pasta');
const contextMenu = document.getElementById('context-menu');
const optionRename = document.getElementById('option-rename');
const colorPickerItem = document.querySelector('.context-menu-item.color-picker-item');
const colorPickerInput = document.getElementById('color-picker');

const optionAddExpense = document.getElementById('option-add-expense');
const optionDeleteCard = document.getElementById('option-delete-card');

// --- Funções de Controle de Seção da Sidebar ---
document.getElementById('btn-home').addEventListener('click', () => {
    document.getElementById('graph-section').classList.remove('active');
    document.getElementById('home-section').classList.add('active');
    atualizarUI();
});

document.getElementById('btn-graph').addEventListener('click', () => {
    document.getElementById('home-section').classList.remove('active');
    document.getElementById('graph-section').classList.add('active');
    renderizarGrafico();
});

// --- Classe para Gerenciamento de Modais Customizadas (REFEITA) ---
class CustomModal {
    constructor(modalElement) {
        this.modal = modalElement;
        this.okBtn = this.modal.querySelector('#custom-prompt-ok, #add-expense-ok, #custom-confirm-ok');
        this.cancelBtn = this.modal.querySelector('#custom-prompt-cancel, #add-expense-cancel, #custom-confirm-cancel');
        this.input = this.modal.querySelector('input[type="text"], input[type="number"]'); // Generaliza para inputs

        // Elementos específicos da modal de despesa (se aplicável)
        this.addExpenseNameInput = this.modal.querySelector('#add-expense-name');
        this.addExpenseValueInput = this.modal.querySelector('#add-expense-value');
        this.addExpenseCategoryNameSpan = this.modal.querySelector('#add-expense-modal-category-name');
        
        this.resolvePromise = null; // Para armazenar a função resolve da Promise

        // Adiciona listener para fechar modal ao clicar no overlay
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this._closeModal(null); // Fecha e resolve com null (cancelado)
            }
        });
    }

    /**
     * Exibe a modal e retorna uma Promise.
     * @param {string} title - O título da modal.
     * @param {string} message - A mensagem a ser exibida.
     * @param {string} defaultValue - O valor padrão para o campo de input (apenas para prompts).
     * @param {string} categoryName - O nome da categoria (apenas para adicionar despesa).
     * @returns {Promise<string|boolean|object|null>} O valor digitado, true/false para confirmação, objeto de despesa, ou null se cancelado.
     */
    show(title, message, defaultValue = '', categoryName = null) {
        return new Promise(resolve => {
            this.resolvePromise = resolve;

            // Configura o conteúdo da modal baseado no tipo
            if (this.modal.id === 'custom-prompt-modal') {
                this.modal.querySelector('h3').textContent = title;
                this.modal.querySelector('p').textContent = message;
                this.input.value = defaultValue;
            } else if (this.modal.id === 'add-expense-modal') {
                this.addExpenseCategoryNameSpan.textContent = categoryName;
                this.addExpenseNameInput.value = '';
                this.addExpenseValueInput.value = '';
            } else if (this.modal.id === 'custom-confirm-modal') {
                this.modal.querySelector('h3').textContent = title;
                this.modal.querySelector('p').textContent = message;
            }

            this.modal.classList.add('active'); // Mostra a modal

            // Foca no input apropriado
            if (this.modal.id === 'custom-prompt-modal' && this.input) {
                setTimeout(() => this.input.focus(), 0);
            } else if (this.modal.id === 'add-expense-modal' && this.addExpenseNameInput) {
                setTimeout(() => this.addExpenseNameInput.focus(), 0);
            }

            // Remove listeners antigos e adiciona novos para esta exibição
            this._removeCurrentEventListeners();
            this._addCurrentEventListeners();
        });
    }

    // Adiciona listeners para esta chamada da modal
    _addCurrentEventListeners() {
        if (this.modal.id === 'custom-prompt-modal') {
            this.okHandler = () => this._closeModal(this.input.value);
            this.cancelHandler = () => this._closeModal(null);
            this.inputKeydownHandler = (e) => {
                if (e.key === 'Enter') this.okHandler();
                else if (e.key === 'Escape') this.cancelHandler();
            };
            this.okBtn.addEventListener('click', this.okHandler);
            this.cancelBtn.addEventListener('click', this.cancelHandler);
            this.input.addEventListener('keydown', this.inputKeydownHandler);
        } else if (this.modal.id === 'add-expense-modal') {
            this.okHandler = () => {
                const nome = this.addExpenseNameInput.value.trim();
                const valor = parseFloat(this.addExpenseValueInput.value);

                if (!nome) { alert('Por favor, insira o nome da despesa.'); return; }
                if (isNaN(valor) || valor <= 0) { alert('Por favor, insira um valor numérico válido para a despesa.'); return; }
                
                // Pega o nome da categoria do span, que foi setado na chamada show()
                const categoryName = this.addExpenseCategoryNameSpan.textContent; 
                this._closeModal({ nome, valor, categoryName });
            };
            this.cancelHandler = () => this._closeModal(null);
            this.nameInputKeydownHandler = (e) => {
                if (e.key === 'Enter') this.addExpenseValueInput.focus();
                else if (e.key === 'Escape') this.cancelHandler();
            };
            this.valueInputKeydownHandler = (e) => {
                if (e.key === 'Enter') this.okHandler();
                else if (e.key === 'Escape') this.cancelHandler();
            };
            this.okBtn.addEventListener('click', this.okHandler);
            this.cancelBtn.addEventListener('click', this.cancelHandler);
            this.addExpenseNameInput.addEventListener('keydown', this.nameInputKeydownHandler);
            this.addExpenseValueInput.addEventListener('keydown', this.valueInputKeydownHandler);
        } else if (this.modal.id === 'custom-confirm-modal') {
            this.okHandler = () => this._closeModal(true);
            this.cancelHandler = () => this._closeModal(false);
            this.okBtn.addEventListener('click', this.okHandler);
            this.cancelBtn.addEventListener('click', this.cancelHandler);
        }
    }

    // Remove os listeners da última exibição da modal
    _removeCurrentEventListeners() {
        if (this.okHandler) this.okBtn.removeEventListener('click', this.okHandler);
        if (this.cancelHandler) this.cancelBtn.removeEventListener('click', this.cancelHandler);

        if (this.modal.id === 'custom-prompt-modal' && this.inputKeydownHandler) {
            this.input.removeEventListener('keydown', this.inputKeydownHandler);
        } else if (this.modal.id === 'add-expense-modal') {
            if (this.nameInputKeydownHandler) this.addExpenseNameInput.removeEventListener('keydown', this.nameInputKeydownHandler);
            if (this.valueInputKeydownHandler) this.addExpenseValueInput.removeEventListener('keydown', this.valueInputKeydownHandler);
        }
        
        // Limpa as referências dos handlers para a próxima chamada
        this.okHandler = null;
        this.cancelHandler = null;
        this.inputKeydownHandler = null;
        this.nameInputKeydownHandler = null;
        this.valueInputKeydownHandler = null;
    }

    // Fecha a modal e resolve a Promise
    _closeModal(valueToResolve) {
        this.modal.classList.remove('active');
        // Usamos setTimeout para garantir que a transição de saída da modal ocorra
        // antes que a Promise seja resolvida e os listeners removidos.
        // Isso evita que a UI reaja a eventos que não deveriam mais acontecer.
        setTimeout(() => {
            if (this.resolvePromise) {
                this.resolvePromise(valueToResolve);
                this.resolvePromise = null; // Limpa a referência da Promise
            }
            this._removeCurrentEventListeners(); // Remove os listeners após resolver
        }, 300); // Ajuste esse tempo se suas transições CSS forem mais longas
    }
}

// Instanciando as modais com a nova classe
const promptModal = new CustomModal(document.getElementById('custom-prompt-modal'));
const addExpenseModal = new CustomModal(document.getElementById('add-expense-modal'));
const confirmModal = new CustomModal(document.getElementById('custom-confirm-modal'));


// --- Funções de Dados e UI (Mantidas as que já funcionavam ou ajustadas minimamente) ---

async function carregarDados() {
    dados = await ipcRenderer.invoke('load-data', username);

    for (const categoria in dados.pastas) {
        if (dados.pastas.hasOwnProperty(categoria)) {
            let pastaData = dados.pastas[categoria];
            let normalizedDespesas = [];
            let existingColor = null;

            if (Array.isArray(pastaData)) {
                normalizedDespesas = pastaData;
            } else if (typeof pastaData === 'object' && pastaData !== null) {
                if (pastaData.hasOwnProperty('despesas') && Array.isArray(pastaData.despesas)) {
                    normalizedDespesas = pastaData.despesas;
                }
                if (pastaData.hasOwnProperty('color')) {
                    existingColor = pastaData.color;
                }
            }

            dados.pastas[categoria] = {
                despesas: normalizedDespesas,
                color: existingColor
            };
        }
    }

    document.getElementById('input-renda').value = dados.renda || '';
    atualizarUI();
}

function salvarRenda() {
    const renda = parseFloat(document.getElementById('input-renda').value);
    if (!isNaN(renda)) {
        dados.renda = renda;
        salvar();
    } else {
        alert('Por favor, insira um valor numérico válido para a renda.');
    }
}

async function salvar() {
    await ipcRenderer.invoke('save-data', username, dados);
}

function atualizarUI() {
    atualizarListaDespesas();
    renderizarCardsPastas();
    atualizarResumoRenda();
}

function atualizarResumoRenda() {
    const rendaMensal = dados.renda || 0;
    let totalGastos = 0;

    Object.values(dados.pastas).forEach(pastaData => {
        totalGastos += pastaData.despesas.reduce((sum, despesa) => sum + d.valor, 0);
    });

    const saldoDisponivel = rendaMensal - totalGastos;

    gastoTotalSpan.textContent = `Gasto: R$ ${totalGastos.toFixed(2)}`;
    saldoDisponivelSpan.textContent = `Disponível: R$ ${saldoDisponivel.toFixed(2)}`;

    if (saldoDisponivel < 0) {
        saldoDisponivelSpan.style.color = '#dc3545';
    } else {
        saldoDisponivelSpan.style.color = '#32cd32';
    }
}

function atualizarListaDespesas() {
    const lista = document.getElementById('lista-despesas');
    lista.innerHTML = '';

    if (Object.keys(dados.pastas).length === 0) {
        lista.innerHTML = '<p>Nenhuma despesa registrada ainda.</p>';
        return;
    }

    Object.entries(dados.pastas).forEach(([categoria, pastaData]) => {
        const categoriaLi = document.createElement('li');
        categoriaLi.innerHTML = `<strong>${categoria}</strong>`;

        const colorBar = document.createElement('div');
        colorBar.classList.add('category-color-bar');
        colorBar.style.setProperty('--category-list-color', pastaData.color || '#61dafb');
        categoriaLi.appendChild(colorBar);

        const ulInterna = document.createElement('ul');
        pastaData.despesas.forEach(d => {
            const li = document.createElement('li');
            li.textContent = `${d.nome}: R$ ${d.valor.toFixed(2)}`;
            ulInterna.appendChild(li);
        });
        categoriaLi.appendChild(ulInterna);
        lista.appendChild(categoriaLi);
    });
}

function renderizarCardsPastas() {
    const pastasContainer = document.getElementById('pastas-container');
    pastasContainer.innerHTML = '';

    const categories = Object.keys(dados.pastas);

    if (categories.length === 0) {
        pastasContainer.innerHTML = '<p>Crie sua primeira pasta para organizar suas despesas!</p>';
        return;
    }

    categories.forEach((categoria) => {
        const pastaData = dados.pastas[categoria];
        const card = document.createElement('div');
        card.classList.add('card-pasta', 'entering');
        card.dataset.pasta = categoria;

        const cardColor = pastaData.color || '#61dafb';
        card.style.setProperty('--card-border-color', cardColor);
        card.style.setProperty('--card-title-color', cardColor);
        card.classList.add('has-custom-color');

        const totalCategoria = pastaData.despesas.reduce((acc, d) => acc + d.valor, 0);

        card.innerHTML = `
            <div class="card-header">
                <h3>${categoria}</h3>
                <button class="card-options-button" data-pasta="${categoria}">...</button>
            </div>
            <ul>
                ${pastaData.despesas.map(d => `<li>${d.nome}: R$ ${d.valor.toFixed(2)}</li>`).join('')}
            </ul>
            <div class="card-total">Total: R$ ${totalCategoria.toFixed(2)}</div>
        `;

        pastasContainer.appendChild(card);

        void card.offsetWidth;
        card.classList.remove('entering');
        card.classList.add('entered');

        // Adiciona o listener para o botão de opções do card
        const optionsButton = card.querySelector('.card-options-button');
        optionsButton.addEventListener('click', (event) => {
            event.stopPropagation(); // Impede que o clique no botão propague para o card
            const pastaName = event.target.dataset.pasta;
            currentPastaName = pastaName;

            const menu = document.getElementById('context-menu');
            menu.style.display = 'block';
            menu.style.left = `${event.pageX}px`;
            menu.style.top = `${event.pageY}px`;

            document.getElementById('color-picker').value = dados.pastas[currentPastaName].color || '#000000';
        });
    });
}

function gerarCoresAleatorias(numCores) {
    const cores = [];
    for (let i = 0; i < numCores; i++) {
        const hue = Math.floor(Math.random() * 360);
        const saturation = Math.floor(Math.random() * (100 - 70) + 70);
        const lightness = Math.floor(Math.random() * (70 - 40) + 40);
        cores.push(`hsla(${hue}, ${saturation}%, ${lightness}%, 0.7)`);
    }
    return cores;
}

function renderizarGrafico() {
    const ctx = document.getElementById('graficoDespesas').getContext('2d');

    if (myChart) {
        myChart.destroy();
    }

    const labels = Object.keys(dados.pastas);
    const data = [];
    const backgroundColors = [];
    const borderColors = [];

    labels.forEach(categoria => {
        const pastaData = dados.pastas[categoria];
        const total = pastaData.despesas.reduce((acc, d) => acc + d.valor, 0);
        data.push(total);

        if (pastaData.color) {
            backgroundColors.push(pastaData.color + 'BF');
            borderColors.push(pastaData.color);
        } else {
            const randomColor = gerarCoresAleatorias(1)[0];
            backgroundColors.push(randomColor);
            borderColors.push(randomColor.replace('0.7)', '1)'));
        }
    });

    if (labels.length === 0 || data.every(value => value === 0)) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.font = '16px Arial';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText('Nenhuma despesa para exibir no gráfico.', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    myChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#fff',
                        font: {
                            size: 14
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += `R$ ${context.parsed.toFixed(2)}`;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// --- Funções de Menu de Contexto e Cores ---
document.addEventListener('click', (event) => {
    // Esconde o menu de contexto se o clique não for dentro dele ou no botão de opções
    if (!contextMenu.contains(event.target) && !event.target.classList.contains('card-options-button')) {
        contextMenu.style.display = 'none';
    }
});

optionAddExpense.addEventListener('click', async () => {
    contextMenu.style.display = 'none';
    if (currentPastaName) {
        const expenseData = await addExpenseModal.show('Adicionar Despesa', '', null, currentPastaName); // Usa a instância da modal
        if (expenseData) { // Se a despesa não foi cancelada
            if (!dados.pastas[expenseData.categoryName]) {
                console.error("Erro: Categoria não encontrada ao adicionar despesa:", expenseData.categoryName);
                alert("Erro interno: Categoria não encontrada. Tente novamente.");
                return;
            }
            dados.pastas[expenseData.categoryName].despesas.push({ nome: expenseData.nome, valor: expenseData.valor });
            salvar();
            atualizarUI();
            alert(`Despesa "${expenseData.nome}" adicionada à pasta "${expenseData.categoryName}"!`);
        }
    }
});

optionRename.addEventListener('click', async () => {
    contextMenu.style.display = 'none';
    if (currentPastaName) {
        const newName = await promptModal.show('Renomear Pasta', `Renomear pasta "${currentPastaName}" para:`, currentPastaName);

        if (newName === null) {
            console.log('Renomeação cancelada.');
            return;
        }

        const trimmedName = newName.trim();
        if (trimmedName !== '' && trimmedName !== currentPastaName) {
            renomearPasta(currentPastaName, trimmedName);
        } else if (trimmedName === '') {
            alert('O nome da pasta não pode ser vazio.');
        }
    }
});

colorPickerItem.addEventListener('click', (event) => {
    event.stopPropagation();
    colorPickerInput.click();
});

colorPickerInput.addEventListener('input', (event) => {
    if (currentPastaName) {
        mudarCorCard(currentPastaName, event.target.value);
    }
});

colorPickerInput.addEventListener('change', () => {
    contextMenu.style.display = 'none';
});

optionDeleteCard.addEventListener('click', async () => {
    contextMenu.style.display = 'none';
    if (currentPastaName) {
        const confirmation = await confirmModal.show('Confirmar Exclusão', `Tem certeza que deseja excluir a pasta "${currentPastaName}" e todas as suas despesas?`);

        if (confirmation) { // Confirmação é true
            excluirCard(currentPastaName);
        } else {
            console.log(`Exclusão da pasta "${currentPastaName}" cancelada.`);
        }
    }
});

function renomearPasta(oldName, newName) {
    if (dados.pastas[newName]) {
        alert(`Já existe uma pasta com o nome "${newName}". Escolha outro nome.`);
        return;
    }

    const pastaData = dados.pastas[oldName];
    delete dados.pastas[oldName];
    dados.pastas[newName] = pastaData;

    salvar();
    atualizarUI();
}

function mudarCorCard(pastaName, color) {
    if (dados.pastas[pastaName]) {
        dados.pastas[pastaName].color = color;
        salvar();
        atualizarUI();
    }
}

function excluirCard(pastaName) {
    if (dados.pastas[pastaName]) {
        delete dados.pastas[pastaName];
        salvar();
        atualizarUI();
        console.log(`Pasta "${pastaName}" excluída.`);
    }
}

// Event listener para o botão "Criar Nova Pasta"
btnCriarPasta.addEventListener('click', async () => {
    const nomePasta = await promptModal.show('Criar Nova Pasta', 'Qual o nome da nova pasta?');

    if (nomePasta === null) { // Se o usuário clicou em cancelar
        console.log('Criação de pasta cancelada pelo usuário.');
        return;
    }

    const trimmedName = nomePasta.trim();
    if (!trimmedName) {
        alert('O nome da pasta não pode ser vazio.');
        return;
    }

    if (dados.pastas[trimmedName]) {
        alert(`A pasta "${trimmedName}" já existe. Escolha outro nome.`);
    } else {
        dados.pastas[trimmedName] = { despesas: [], color: '#61dafb' };
        salvar();
        atualizarUI();
        alert(`Pasta "${trimmedName}" criada com sucesso!`);
    }
});


// --- Início da Aplicação ---
carregarDados();

// Expõe as funções para o escopo global (usado pelos onclick diretamente no HTML)
window.salvarRenda = salvarRenda;