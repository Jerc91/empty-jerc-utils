// inicio configuración JMain 
window.myApp = new jr.namespace();
jr({ packages: 'assets/config/packages.json' }).then(() => myApp.main());

myApp.addNS('main', () => {
	let api = {};

	Promise.all([
		jr.setHTML([
	        { src: 'views/header.html', query: '#headerMain' },
	        { src: 'views/main.html', query: '#wrapperMain' },
	        { src: 'views/footer.html', query: '#footerMain' }
		]),
		jr.service('base')
	]).then(() => {
		let spinner = document.querySelector('#block');
		spinner.classList.add('off');
		spinner.classList.remove('on');
	});

	return api;
});