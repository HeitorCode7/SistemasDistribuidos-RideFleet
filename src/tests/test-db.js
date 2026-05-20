'use strict';

const driverService =
  require('../drivers/driverService');

async function run() {

  console.log('\n============================');
  console.log('LISTANDO MOTORISTAS');
  console.log('============================');

  const drivers =
    await driverService.listDrivers();

  console.log(drivers);

  console.log('\n============================');
  console.log('MOTORISTAS DISPONÍVEIS');
  console.log('============================');

  const availableDrivers =
    await driverService.listAvailableDrivers();

  console.log(availableDrivers.length);

  console.log('\n============================');
  console.log('ASSIGN DRIVER');
  console.log('============================');

  const assigned =
    await driverService.assignDriver(
      'ride-001'
    );

  console.log(assigned);

  console.log('\n============================');
  console.log('SNAPSHOT');
  console.log('============================');

  const snapshot =
    await driverService.getSnapshot();

  console.log(snapshot);

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});