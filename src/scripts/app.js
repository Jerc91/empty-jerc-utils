// inicio configuración JMain 
requestAnimationFrame(() => {
	window.myApp = new jr.namespace();
	jr({ packages: 'assets/config/packages.json' }).then(() => myApp.main());

	myApp.addNS('main', () => {
		let api = {};

		get([
			{ src: 'views/header.html', query: '#headerMain' },
			{ src: 'views/main.html', query: '#wrapperMain' },
			{ src: 'views/footer.html', query: '#footerMain' },
			jr.service('base')
		]).then(function () {
			let spinner = document.querySelector('#block');
			spinner.classList.add('off');
			spinner.classList.remove('on');
			jr.workersCount = 3;
		});

		return api;
	});    
});