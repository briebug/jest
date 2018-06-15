import {
  Rule,
  SchematicContext,
  Tree,
  chain,
  url,
  apply,
  move,
  mergeWith,
} from '@angular-devkit/schematics';
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';

import {
  removePackageJsonDependency,
  JestOptions,
  safeFileDelete,
  addPropertyToPackageJson,
  getWorkspaceConfig,
  getAngularVersion,
  getLatestNodeVersion,
  NpmRegistryPackage,
} from './utility/util';

import {
  addPackageJsonDependency,
  NodeDependencyType,
} from './utility/dependencies';
import { Observable, of } from 'rxjs';
import { map, concatMap } from 'rxjs/operators';

export default function(options: JestOptions): Rule {
  return (tree: Tree, context: SchematicContext) => {
    options = { ...options, __version__: getAngularVersion(tree) };

    return chain([
      updateDependencies(),
      cleanAngularJson(options),
      removeFiles(),
      addJestFiles(),
      addJestToPackageJson(options),
      addTestScriptsToPackageJson(),
    ])(tree, context);
  };
}

function updateDependencies(): Rule {
  return (tree: Tree, context: SchematicContext): Observable<Tree> => {
    const removeDependencies = [
      'karma',
      'karma-jasmine',
      'karma-jasmine-html-reporter',
      'karma-chrome-launcher',
      'karma-coverage-istanbul-reporter',
    ];
    const addDependencies = of('jest', 'jest-preset-angular');

    context.logger.debug('Remove Karma & Jasmine dependencies');

    removeDependencies.forEach((packageName) => {
      context.logger.debug(`Removing ${packageName}...`);

      removePackageJsonDependency(tree, {
        type: NodeDependencyType.Dev,
        name: packageName,
      });
    });

    context.logger.debug('Adding Jest dependencies...');

    context.addTask(new NodePackageInstallTask());

    return addDependencies.pipe(
      concatMap((packageName) => getLatestNodeVersion(packageName)),
      map((packageFromRegistry: NpmRegistryPackage) => {
        console.log('adding');

        const { name, version } = packageFromRegistry;
        context.logger.debug(
          `Adding ${name}:${version} to ${NodeDependencyType.Dev}`
        );

        const jestDependency = {
          type: NodeDependencyType.Dev,
          name,
          version,
        };

        addPackageJsonDependency(tree, jestDependency);
        return tree;
      })
    );
  };
}

function cleanAngularJson(options: JestOptions): Rule {
  return (tree: Tree, context: SchematicContext) => {
    context.logger.debug('Cleaning Angular.json file');

    if (options.__version__ === 6) {
      const { projectProps, workspacePath, workspace } = getWorkspaceConfig(
        tree,
        options
      );

      if (projectProps && projectProps.architect) {
        // remove test default ng test configuration
        delete projectProps.architect.test;

        tree.overwrite(workspacePath, JSON.stringify(workspace, null, 2));
      }
    } else if (options.__version__ < 6) {
      // TODO: clean up angular-cli.json file. different format that V6 angular.json
      console.warn(
        'Automated clean up of the angular-cli.json file is not currently support for apps < version 6'
      );
    }
    return tree;
  };
}

function removeFiles(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const deleteFiles = [
      './src/karma.conf.js',
      './karma.conf.js',
      './src/test.ts',

      // unable to overwrite these with the url() approach.
      './jest.config.js',
      './src/setup-jest.ts',
      './src/test-config.helper.ts',
    ];

    deleteFiles.forEach((filePath) => {
      context.logger.debug(`removing ${filePath}`);

      safeFileDelete(tree, filePath);
    });

    return tree;
  };
}

function addJestFiles(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    context.logger.debug('adding jest files to host dir');

    return chain([mergeWith(apply(url('./files'), [move('./')]))])(
      tree,
      context
    );
  };
}

function addJestToPackageJson(options: JestOptions): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const configChoice = options.config || '';

    if (configChoice.toLowerCase() === 'packagejson') {
      addPropertyToPackageJson(
        tree,
        context,
        'jest',
        require('./files/jest.config.js')
      );
    }
    return tree;
  };
}

function addTestScriptsToPackageJson(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    // prettier-ignore
    addPropertyToPackageJson(tree, context, 'scripts', {
      'test': 'jest',
      'test:watch': 'jest --watch'
    });
    return tree;
  };
}
