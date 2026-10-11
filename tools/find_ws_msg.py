with open('server/src/server.js', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'on(\'message\'' in line or 'on("message"' in line or 'handleClientMessage' in line:
            print(f'{i+1}: {line.strip()}')
