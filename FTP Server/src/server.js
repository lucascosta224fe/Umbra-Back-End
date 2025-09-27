// Quick start, create an active ftp server.
const FtpSrv = require('ftp-srv');

const port=5000;
const ftpServer = new FtpSrv({
    url: "ftp://127.0.0.1:" + port,
    anonymous: true
});

ftpServer.on('login', ({ connection, username, password }, resolve, reject) => { 
    if(username === 'admin' && password === '123'){
        return resolve({ root:"./src/arquivos" });    
    }
    return reject(new errors.GeneralError('Invalid username or password', 401));
});

ftpServer.listen().then(() => { 
    console.log('Ftp server is starting...')
});