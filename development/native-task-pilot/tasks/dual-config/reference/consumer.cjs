const configure=require('./index.cjs');exports.render=(value,option)=>JSON.stringify(value,null,configure(option).indent);
