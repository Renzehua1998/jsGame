new Vue({
    el: '#app',
    data: {
        gameOn: true,  // 为true才可以操作，否则停止
        board: [],  // 整个游戏框
        rows: 9,  // 行数
        cols: 9,  // 列数
        mines: 10,  // 雷数
        noMine: 0,  // 不是雷的数量
        safeRemain: 0,  // 当前等待被挖开的数量
        marked: 0,  // 当前除标记外剩余的雷数（可以为负）
        markedStr: '000',  // 剩余雷数字符串格式（用于展示）
        wrongIndex: [-1, -1],  // 当前踩到雷的位置（展示用）
        selectedLevel: 'level1',  // 游戏等级
        time: 0,  // 计时变量
        timeStr: '000',  // 计时字符串（展示用）
        timecount: null  // 计时进程
    },
    mounted() {
        this.startGame()
    },
    methods: {
        suitMobile() {
            // 兼容手机平板
            const mediaQueryList = window.matchMedia('(max-width: 1200px)');
            if (mediaQueryList.matches) {
                // @media属性匹配时的处理逻辑（手机端）
                if (this.selectedLevel == 'level1') return 'board-simple';
                else if (this.selectedLevel == 'level2') return 'board-medium';
                else return 'board-hard';
            } else {
                // @media属性不匹配时的处理逻辑（电脑端）
                return 'board';
            }
            
        },
        // 设置游戏等级
        handleSelection() {
            switch (this.selectedLevel) {
                case 'level1':
                    this.rows = 9;
                    this.cols = 9;
                    this.mines = 10;
                    break;
                case 'level2':
                    this.rows = 16;
                    this.cols = 16;
                    this.mines = 40;
                    break;
                case 'level3':
                    this.rows = 16;
                    this.cols = 30;
                    this.mines = 99;
                    break;
            }
            this.startGame();
        },
        // 重新开始游戏,重置各项参数
        startGame() {
            clearInterval(this.timecount)  // 停止计时
            this.board = this.generateBoard();
            this.safeRemain = this.rows * this.cols - this.mines;
            this.noMine = this.safeRemain;
            this.marked = this.mines;
            this.markedStr = this.getStr(this.marked);
            this.gameOn = true;
            this.wrongIndex = [-1, -1];
            this.time = 0;
            this.timeStr = '000';

        },
        // 按照行数、列数、雷数生成地图
        generateBoard() {
            const board = [];
            for (let i = 0; i < this.rows; i++) {
                const row = [];
                for (let j = 0; j < this.cols; j++) {
                    row.push({
                        isMine: false,  // 是不是雷
                        revealed: false,  // 是否被挖开
                        marked: false,  // 是否被标记
                        adjacentMines: 0  // 周围的雷数
                    });
                }
                board.push(row);
            }
            // this.placeMines(board);
            // this.calculateAdjacentMines(board);
            return board;
        },
        // 随机放置雷
        placeMines(board, click_row, click_col) {
            let minesToPlace = this.mines;
            while (minesToPlace > 0) {
                const row = Math.floor(Math.random() * this.rows);
                const col = Math.floor(Math.random() * this.cols);
                if (!board[row][col].isMine && !(click_col == col && click_row == row)) {
                    board[row][col].isMine = true;
                    minesToPlace--;
                }
            }
            this.calculateAdjacentMines(board);
        },
        // 计算周围雷数
        calculateAdjacentMines(board) {
            for (let i = 0; i < this.rows; i++) {
                for (let j = 0; j < this.cols; j++) {
                    if (!board[i][j].isMine) {
                        let count = 0;
                        for (let x = -1; x <= 1; x++) {
                            for (let y = -1; y <= 1; y++) {
                                if (i + x >= 0 && i + x < this.rows && j + y >= 0 && j + y < this.cols) {
                                    if (board[i + x][j + y].isMine) {
                                        count++;
                                    }
                                }
                            }
                        }
                        board[i][j].adjacentMines = count;
                    }
                }
            }
        },
        // 传入坐标进行挖掘（点击左键）
        revealCell(row, col) {
            if (this.gameOn) {  // 只在游戏进行中可以操作
                if (this.safeRemain == this.noMine) {  // 第一次点击时生成雷，保证不会开局挂
                    this.placeMines(this.board, row, col);
                    let _this = this;  // 开始计时
                    this.timecount = setInterval(function(){
                        _this.time += 1;
                        _this.timeStr = _this.getStr(_this.time);
                    },1000)
                }

                const cell = this.board[row][col];
                if (!cell.revealed && !cell.marked) {  // 未被翻开也未被标记
                    cell.revealed = true;
                    if (cell.isMine) {
                        this.wrongIndex = [row, col]
                        this.showDetail();
                        clearInterval(this.timecount)  // 停止计时
                        alert('Game Over!');
                        this.gameOn = false;
                    } else if (cell.adjacentMines === 0) {
                        this.revealAdjacentCells(row, col);
                    }
                    this.safeRemain -= 1;
                    if (this.safeRemain == 0) {
                        this.showDetail();
                        clearInterval(this.timecount)  // 停止计时
                        alert('You Won!');
                        this.gameOn = false;
                    }
                }
            }
        },
        // 标记雷（点击右键）
        markupCell(row, col) { 
            event.preventDefault(); // 阻止默认的右键菜单弹出
            if (this.gameOn) {
                const cell = this.board[row][col];
                if (!cell.revealed) {  // 只对未翻开的方块进行标记
                    if (!cell.marked) {
                        this.marked -= 1;
                    } else {
                        this.marked += 1;
                    }
                    this.markedStr = this.getStr(this.marked);  // 将剩余雷数转换为字符串
                    cell.marked = !cell.marked;
                }
            }
        },
        // 挖掘临近的其它块（递归DFS）
        revealAdjacentCells(row, col) {
            for (let x = -1; x <= 1; x++) {
                for (let y = -1; y <= 1; y++) {
                    if (row + x >= 0 && row + x < this.rows && col + y >= 0 && col + y < this.cols) {
                        const cell = this.board[row + x][col + y];
                        if (!cell.revealed && !cell.isMine) {
                            cell.revealed = true;
                            this.safeRemain -= 1;
                            if (cell.adjacentMines === 0) {
                                this.revealAdjacentCells(row + x, col + y);
                            }
                        }
                    }
                }
            }
        },
        // 结算
        showDetail() {
            for (let i = 0; i < this.rows; i++) {
                for (let j = 0; j < this.cols; j++) {
                    const cell = this.board[i][j];
                    if (cell.isMine) {  // 所有的雷都挖开
                        cell.revealed = true;
                    }
                    if (cell.marked && !cell.isMine) {  // 标错的挖开
                        cell.revealed = true;
                    }
                }
            }
        },
        // 将剩余雷数转换为字符串
        getStr(num) {
            let result;
            let _num = String(num)
            if (_num.length == 1) {
                result = '00' + _num;
            } else if (_num.length == 2) {
                result = '0' + _num;
            } else {
                result = _num;
            }
            return result;
        }
    }
});