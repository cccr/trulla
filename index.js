#!/usr/bin/env node

const fs = require('fs');

const EMPTY = {flag: 0x0, symbol: "E", description: "emptyFile",}; // 0001
const OTHER_LINE = {flag: 0x1, symbol: "O",}; // 0001
const INCLUDE = {flag: 0x2, symbol: "I",}; // 0010
const REWRITE = {flag: 0x4, symbol: "RW",}; // 0100
const REDIRECT = {flag: 0x8, symbol: "R",}; // 1000

const commentedLine = new RegExp(/^(\s*#).*/);
const emptyLine = new RegExp(/^(\s)*$/);

const includeDirective = new RegExp(/^((?!#).)*Include (\S*)(.*)?$/);
const rewriteDirective = new RegExp(/^\s*(Rewrite[\S]+)+/);
const redirectDirective = new RegExp(/^\s*(Redirect [\S]+)+/);

const result = {
        "nodes": {},
        "links": [],
    };

const contentDecode = function(flag) {
    if (flag === EMPTY.flag) return ["E"];

    const masks = [OTHER_LINE, INCLUDE, REWRITE, REDIRECT,]; //order is important!
    let result = [];
    masks.forEach((mask) => { if (flag & mask.flag) result.push(mask.symbol)});
    return result;
}

const dig = function(file) {
  return new Promise((resolve, reject) => {

    const lineReader = require('readline').createInterface({
        input: require('fs').createReadStream(file)
    });

    const node = {
        props: {
            emptyFile: true,
            contentFlag: 0x0
        },
        stat: {
            lineCount: 0,
            nonEmptyLineCount: 0,
            includeDirectivesCount: 0,
            rewriteDirectivesCount: 0,
            redirectDirectivesCount: 0
        }
    }

    lineReader.on('line', function (line) {
        node.stat.lineCount++;

        if (!commentedLine.test(line) && !emptyLine.test(line)) {
            node.stat.nonEmptyLineCount++;

            if (includeDirective.test(line)) {
                node.stat.includeDirectivesCount++;
                const included = includeDirective.exec(line)[2];
                const link = {
                    "source": file,
                    "target": included
                };
                result.links.push(link);
                dig(included).then(() => {});
            } else if (rewriteDirective.test(line)) {
                node.stat.rewriteDirectivesCount++;
            } else if (redirectDirective.test(line)) {
                node.stat.redirectDirectivesCount++;
            }
        }
    });

    lineReader.on('close', function (line) {
        setNodeFlags(node);
        result.nodes[file] = node;
        if (file = 'conf/httpd.conf') {
            resolve();
        }
    });
  })
}

const setNodeFlags = function(node) {
  node.props.emptyFile = node.stat.nonEmptyLineCount === 0;
  if (!node.props.emptyFile) {
      node.props.contentFlag |= node.stat.includeDirectivesCount ?
        INCLUDE.flag :
        0x0;
      node.props.contentFlag |= node.stat.rewriteDirectivesCount ?
        REWRITE.flag :
        0x0;
      node.props.contentFlag |= node.stat.redirectDirectivesCount ?
        REDIRECT.flag :
        0x0;
      node.props.contentFlag |= (node.stat.nonEmptyLineCount >
        node.stat.rewriteDirectivesCount +
        node.stat.includeDirectivesCount +
        node.stat.redirectDirectivesCount) ?
          OTHER_LINE.flag :
          0x0;
  }
  node.props.content = contentDecode(node.props.contentFlag);
}


const http = require('http');

http.createServer(function(req, res) {
  if (req.url === '/links.json') {
    dig('conf/httpd.conf').then(() => {
      let data = JSON.stringify(result);
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': data.length, });
      res.write(data);
      res.end();
    });
  } else {
    fs.readFile(__dirname + '\\index.html', function (err, data) {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': data.length, });
      res.write(data);
      res.end();
    });
  }
}).listen(48078);

console.log('Open http://localhost:48078/ for results');
